// backup-utils.cjs — PURE backup rotation rules, extracted from main.cjs so
// they can be unit-tested without booting Electron.
//
// User request (2026-11-17): "make the app leave back up each time. whenever
// we reach 30 backups it deletes the oldest one automatically. the folder
// location thing is important here to not make mistakes, must delete carefuly"
//
// The rotation window and the EXACT file-name pattern live here; main.cjs
// adds the filesystem paranoia (resolve the .backups dir from the CURRENT
// data file, lstat every candidate, never follow anything out of the dir).

// Rotation window: keep the newest 30 backups (was 20 before v1.1.0).
const BACKUP_KEEP = 30

// A backup file name is EXACTLY
//   tracker-<ISO-timestamp-with-:-and-.-replaced-by-->.json
// e.g. tracker-2026-11-17T09-00-00-000Z.json
// The rotation deleter refuses EVERYTHING that does not match this shape.
const BACKUP_NAME_RE = /^tracker-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/

function isBackupFileName(name) {
  return BACKUP_NAME_RE.test(name)
}

// Of the backup-named entries (sorted lexicographically = chronologically
// for this timestamp scheme), return the ones to delete so only the newest
// `keep` survive. Non-matching names are never returned.
function selectBackupsToDelete(names, keep = BACKUP_KEEP) {
  const list = (Array.isArray(names) ? names : []).filter(isBackupFileName).sort()
  return list.length > keep ? list.slice(0, list.length - keep) : []
}

module.exports = {
  BACKUP_KEEP,
  BACKUP_NAME_RE,
  isBackupFileName,
  selectBackupsToDelete
}
