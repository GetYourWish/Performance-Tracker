// tracker store — the Android app's single authority for reading and
// writing tracker.json through a pluggable FsAdapter (SAF in production,
// in-memory in tests). Framework-free: React binds via getSnapshot/subscribe.
//
// Guarantees (mirroring desktop/electron/main.cjs + docs/SYNC-DESIGN.md):
//  - SCHEMA GATE: numeric schemaVersion > 1 is refused (SCHEMA_VERSION_TOO_NEW),
//    missing/non-number treated as 1. Refused files are never healed/written.
//  - NO-CHANGE-NO-WRITE: identical content never hits the disk.
//  - REBASE (SYNC-DESIGN Option A): every mutation first re-reads the file;
//    if another device wrote since our last load/write, the fresh content is
//    schema-gated + healed and the mutation is applied ON TOP of it — the
//    phone can never silently clobber a concurrent desktop edit.
//  - ATOMIC WRITE: content is written to tracker.json.tmp in the SAME
//    directory, read back and verified byte-for-byte, then the verified
//    content is written to the target document and the tmp removed. SAF has
//    no rename-clobber, so the final replace is a full-document write; the
//    verified tmp copy + the pre-clobber backup are the crash-recovery
//    layers. Partial content never reaches the target on purpose.
//  - BACKUPS: before overwriting an externally-changed file (and on manual
//    request), the current on-disk content is copied to the app-private
//    .backups/ with the desktop naming scheme, rolling window of 20.
//  - CONFLICTS: Syncthing's tracker*-conflict-* copies are surfaced as a
//    list; never auto-loaded, never auto-deleted, never healed.

import { checkSchemaVersion, validateAndHealData, createDefaultData } from '@performance-tracker/core'
import { backupFileName, selectOldBackups } from './backups.js'

export const CONFLICT_PATTERN = /tracker.*-conflict-/

function compactOf(value) {
  return JSON.stringify(value)
}

export function createTrackerStore({ adapter, dirUri, fileName = 'tracker.json' }) {
  const listeners = new Set()

  const state = {
    // 'no-folder' | 'loading' | 'ready' | 'missing' | 'schema-too-new' | 'error'
    status: dirUri ? 'loading' : 'no-folder',
    data: null, // healed data
    schemaVersion: null, // set when refused
    errorMessage: null, // corrupt JSON / IO errors
    conflicts: [], // Syncthing conflict file NAMES found in the folder
    folderUri: dirUri || null,
    fileName
  }

  // --- internal refs (not part of the snapshot) ---
  let targetUri = null // resolved child document uri (null when missing)
  let knownRaw = null // raw string we believe is on disk (load or last write)
  let healedCompact = null // compact JSON of the healed data we hold
  let lastStat = null // { exists, size, modificationTime }
  let busy = false // write in flight → polling skips
  let dirListing = [] // last child URIs (conflict detection)

  function notify(next) {
    Object.assign(state, next)
    listeners.forEach(l => l())
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function getSnapshot() {
    return state
  }

  // --- helpers -----------------------------------------------------------

  async function listFolder() {
    dirListing = await adapter.listChildren(state.folderUri)
    const names = dirListing.map(u => adapter.fileNameOf(u))
    const conflicts = names.filter(n => CONFLICT_PATTERN.test(n))
    targetUri = null
    for (let i = 0; i < dirListing.length; i++) {
      if (names[i] === state.fileName) {
        targetUri = dirListing[i]
        break
      }
    }
    return conflicts
  }

  async function rotateBackup(rawContent, nowIso) {
    if (!rawContent) return
    const baseDir = adapter.appDocumentsDir()
    const backupDir = baseDir + '.backups/'
    await adapter.ensureAppDir(backupDir)
    await adapter.appWriteFile(backupDir + backupFileName(nowIso), rawContent)
    const children = await adapter.appListDir(backupDir)
    const names = children.map(u => adapter.fileNameOf(u))
    for (const name of selectOldBackups(names)) {
      const uri = children.find(u => adapter.fileNameOf(u) === name)
      if (uri) await adapter.appDelete(uri)
    }
  }

  function gateOrThrow(parsed) {
    const gate = checkSchemaVersion(parsed)
    if (!gate.ok) {
      const err = new Error(gate.message)
      err.code = 'SCHEMA_VERSION_TOO_NEW'
      err.schemaVersion = gate.schemaVersion
      return err
    }
    return null
  }

  // Core load path: list → find target → read → gate → heal → snapshot.
  async function load() {
    if (!state.folderUri) {
      notify({ status: 'no-folder' })
      return state
    }
    notify({ status: 'loading', errorMessage: null })
    try {
      const conflicts = await listFolder()
      lastStat = targetUri ? await adapter.statDocument(targetUri) : null

      if (!targetUri) {
        notify({ status: 'missing', data: null, conflicts, lastMissingAt: Date.now() })
        return state
      }

      const raw = await adapter.readDocument(targetUri)
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch (e) {
        notify({ status: 'error', errorMessage: 'Corrupt JSON: ' + e.message, conflicts })
        return state
      }

      const gateErr = gateOrThrow(parsed)
      if (gateErr) {
        notify({
          status: 'schema-too-new',
          data: null,
          schemaVersion: gateErr.schemaVersion,
          conflicts
        })
        return state
      }

      const healed = validateAndHealData(parsed)
      knownRaw = raw
      healedCompact = compactOf(healed)
      notify({ status: 'ready', data: healed, conflicts, schemaVersion: null, errorMessage: null })
      return state
    } catch (e) {
      // SAF permission lost (reboot/app standby) or folder gone → setup again
      notify({ status: 'no-folder', errorMessage: e.message })
      return state
    }
  }

  // External-change poll: cheap stat first; reload only when changed.
  // `force` bypasses the stat comparison (pull-to-refresh).
  async function checkExternal(force = false) {
    if (busy) return false
    if (!state.folderUri) return false
    if (state.status !== 'ready' && state.status !== 'missing' && !force) return false
    try {
      const conflicts = await listFolder()
      const stat = targetUri ? await adapter.statDocument(targetUri) : null

      const sameStat =
        lastStat && stat
          ? lastStat.size === stat.size && lastStat.modificationTime === stat.modificationTime
          : lastStat === stat // both null, or one side vanished

      notifyConflictsIfChanged(conflicts)
      if (!force && sameStat && state.status !== 'schema-too-new') return false
      await load()
      return true
    } catch (e) {
      // permission lost while backgrounded — surface setup screen
      notify({ status: 'no-folder', errorMessage: e.message })
      return false
    }
  }

  function notifyConflictsIfChanged(conflicts) {
    const prev = state.conflicts
    if (prev.length !== conflicts.length || prev.some((n, i) => n !== conflicts[i])) {
      notify({ conflicts })
    }
  }

  // --- write path ---------------------------------------------------------

  // Persist `nextData` (already healed-shaped) with all guarantees above.
  async function writeData(nextData, { clobberRaw = null } = {}) {
    const nextCompact = compactOf(nextData)
    if (nextCompact === healedCompact) {
      notify({ data: nextData })
      return { skipped: true }
    }

    // pre-clobber backup: the on-disk content belongs to another device
    if (clobberRaw) await rotateBackup(clobberRaw, new Date().toISOString())

    const pretty = JSON.stringify(nextData, null, 2) // desktop atomicSave format

    // refresh the directory listing (the target may have appeared/vanished)
    await listFolder()

    // 1) tmp document in the SAME directory, verified byte-for-byte
    const tmpName = state.fileName + '.tmp'
    const existingTmp = dirListing.find(u => adapter.fileNameOf(u) === tmpName)
    if (existingTmp) await adapter.removeDocument(existingTmp)
    const tmpUri = await adapter.createDocument(state.folderUri, tmpName)
    await adapter.writeDocument(tmpUri, pretty)
    const verify = await adapter.readDocument(tmpUri)
    if (verify !== pretty) {
      await adapter.removeDocument(tmpUri).catch(() => {})
      throw new Error('Temporary write verification failed — target left untouched')
    }

    // 2) replace the target (full-document write; tmp remains as recovery
    //    copy until the very end)
    if (!targetUri) {
      targetUri = await adapter.createDocument(state.folderUri, state.fileName)
    }
    await adapter.writeDocument(targetUri, pretty)

    // 3) drop the tmp artifact
    await adapter.removeDocument(tmpUri).catch(() => {})

    knownRaw = pretty
    healedCompact = nextCompact
    lastStat = await adapter.statDocument(targetUri)
    return { skipped: false }
  }

  // Apply a pure mutation with the REBASE semantics described at the top.
  // buildNext(baseHealedData) → nextData. Throws SchemaTooNewError when the
  // rebased file was written by a newer app (mutation aborted, file safe).
  async function mutate(buildNext) {
    if (!state.folderUri || state.status === 'schema-too-new') {
      throw new Error('Cannot save: no writable data file loaded')
    }
    busy = true
    try {
      // REBASE: always mutate on top of the newest on-disk content.
      let base
      let clobberRaw = null
      let freshRaw = null
      try {
        freshRaw = targetUri ? await adapter.readDocument(targetUri) : null
      } catch (e) {
        freshRaw = null // file vanished — write will recreate it
      }
      if (freshRaw != null && freshRaw !== knownRaw) {
        const parsed = JSON.parse(freshRaw) // throws → corrupt base, abort
        const gateErr = gateOrThrow(parsed)
        if (gateErr) {
          notify({
            status: 'schema-too-new',
            data: null,
            schemaVersion: gateErr.schemaVersion
          })
          throw gateErr
        }
        base = validateAndHealData(parsed)
        knownRaw = freshRaw
        healedCompact = compactOf(base)
        clobberRaw = freshRaw // we are about to overwrite another device's bytes
      } else {
        base = state.data
      }
      if (!base) base = createDefaultData()

      const next = buildNext(base)
      const result = await writeData(next, { clobberRaw })
      notify({ data: next, status: 'ready' })
      return { ...result, data: next }
    } finally {
      busy = false
    }
  }

  // First-run helper: write createDefaultData() into the picked folder.
  async function initializeDefault() {
    busy = true
    try {
      const def = createDefaultData()
      // brand-new file: no rebase needed, no backup of prior content
      const result = await writeData(def)
      notify({ data: def, status: 'ready' })
      return { ...result, data: def }
    } finally {
      busy = false
    }
  }

  // desktop 'backup-now' IPC: copy current on-disk content into .backups/
  async function backupNow() {
    const raw = targetUri ? await adapter.readDocument(targetUri) : null
    await rotateBackup(raw, new Date().toISOString())
    return true
  }

  async function setFolder(newDirUri) {
    notify({ folderUri: newDirUri, status: newDirUri ? 'loading' : 'no-folder' })
    return load()
  }

  return {
    // react binding
    subscribe,
    getSnapshot,
    // lifecycle
    load,
    checkExternal,
    setFolder,
    initializeDefault,
    backupNow,
    // mutations
    mutate
  }
}

// exported for tests / UI messaging
export function isSchemaTooNewError(err) {
  return !!err && err.code === 'SCHEMA_VERSION_TOO_NEW'
}
