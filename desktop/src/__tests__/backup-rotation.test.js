// backup-rotation.test.js — the desktop backup rotation rules (v1.1.0).
//
// User request (2026-11-17): the app leaves a backup each time it runs, and
// when 30 backups are reached the oldest is deleted automatically — "the
// folder location thing is important here to not make mistakes, must delete
// carefuly". The PURE selection rules live in electron/backup-utils.cjs;
// these tests pin them (the filesystem paranoia around them — dir
// re-resolution, lstat, containment checks — lives in main.cjs
// pruneOldBackups).
import { describe, it, expect } from 'vitest'
// The import below trips the renderer-hygiene no-restricted-imports rule
// because the PATH contains the 'electron' segment — but this module is the
// deliberately PURE, Electron-free rotation rules (see its header), imported
// only by the Vitest/Node test runner and by main.cjs. No Electron runtime
// is ever booted from here.
// eslint-disable-next-line no-restricted-imports -- pure rules module; the rule targets shipped renderer code importing Node/electron builtins
import {
  BACKUP_KEEP,
  BACKUP_NAME_RE,
  isBackupFileName,
  selectBackupsToDelete
} from '../../electron/backup-utils.cjs'

const name = iso => `tracker-${iso.replace(/[:.]/g, '-')}.json`
const N = n => name(`2026-11-${String(n).padStart(2, '0')}T09-00-00-000Z`)

describe('backup-utils rotation window', () => {
  it('keeps 30 backups (v1.1.0 window)', () => {
    expect(BACKUP_KEEP).toBe(30)
  })

  it('selects the oldest beyond the window', () => {
    const names = Array.from({ length: 33 }, (_, i) => N(i + 1))
    const toDelete = selectBackupsToDelete(names)
    expect(toDelete).toEqual([N(1), N(2), N(3)])
    // newest survives
    expect(toDelete).not.toContain(N(33))
  })

  it('deletes nothing at or below the window', () => {
    expect(selectBackupsToDelete([N(1), N(2), N(3)])).toEqual([])
    expect(selectBackupsToDelete([])).toEqual([])
    const exactly30 = Array.from({ length: 30 }, (_, i) => N(i + 1))
    expect(selectBackupsToDelete(exactly30)).toEqual([])
  })

  it('deletes exactly one when crossing the threshold', () => {
    const names = Array.from({ length: 31 }, (_, i) => N(i + 1))
    expect(selectBackupsToDelete(names)).toEqual([N(1)])
  })
})

describe('backup-utils file-name safety ("must delete carefuly")', () => {
  it('accepts only the exact tracker-<timestamp>.json shape', () => {
    expect(isBackupFileName(N(1))).toBe(true)
    expect(isBackupFileName('tracker-2026-11-17T09-00-00-000Z.json')).toBe(true)
  })

  it('rejects everything else a folder may contain', () => {
    const dangerous = [
      'tracker.json',                     // the live data file itself
      'tracker-.json',                    // empty timestamp
      'tracker-2026-11-17T09-00-00.json', // missing millis
      'tracker-2026-11-17T09-00-00-000Z.json.bak',
      'tracker-2026-11-17T09-00-00-000Z.json.exe',
      'tracker-../../etc/passwd',
      '../tracker-2026-11-17T09-00-00-000Z.json',
      'tracker-2026-11-17T09-00-00-000Z',
      'mytracker-2026-11-17T09-00-00-000Z.json',
      'notes.txt',
      'tracker-conflict-2026-11-17.json',
      '.tmp',
      'conflict-copy.json'
    ]
    for (const f of dangerous) {
      expect(isBackupFileName(f)).toBe(false)
    }
  })

  it('the pattern has no path or traversal surface', () => {
    // The regex is anchored (^...$). Its only dot is the ESCAPED literal in
    // \.json — there is no unescaped wildcard dot, no slash and no
    // backslash, so a crafted name cannot traverse out of .backups through
    // the pattern itself.
    expect(BACKUP_NAME_RE.source.startsWith('^tracker-')).toBe(true)
    expect(BACKUP_NAME_RE.source.endsWith('\\.json$')).toBe(true)
    expect(BACKUP_NAME_RE.source.replace('\\.json', '')).not.toContain('.')
    expect(BACKUP_NAME_RE.source).not.toContain('/')
    expect(BACKUP_NAME_RE.source).not.toContain('\\\\')
  })

  it('rotation never returns non-backup names even when mixed in', () => {
    const mixed = [
      'tracker.json',
      N(1),
      'important-notes.txt',
      ...Array.from({ length: 32 }, (_, i) => N(i + 2)),
      'tracker-conflict-x.json'
    ]
    const toDelete = selectBackupsToDelete(mixed)
    expect(toDelete.length).toBeGreaterThan(0)
    for (const f of toDelete) {
      expect(isBackupFileName(f)).toBe(true)
    }
    expect(toDelete).not.toContain('tracker.json')
    expect(toDelete).not.toContain('important-notes.txt')
    expect(toDelete).not.toContain('tracker-conflict-x.json')
  })
})
