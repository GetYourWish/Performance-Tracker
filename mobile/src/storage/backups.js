// Rolling backup window — desktop parity with electron/main.cjs createBackup().
//
// Desktop keeps `.backups/tracker-<timestamp>.json` NEXT TO the data file
// (last 20). On Android the data file lives in a Syncthing-fed SAF folder:
// a `.backups` folder there would (a) need directory creation the SAF API
// does not expose and (b) sync backup churn to every peer. So the Android
// app keeps the SAME naming scheme and rotation window in its app-private
// documents directory instead — restore copies stay on the device that
// created them, and the synced folder stays clean.
//
// The pure helpers below are unit-tested in Node (__tests__/store.test.js).

export const BACKUP_PREFIX = 'tracker-'
export const BACKUP_EXT = '.json'
export const BACKUP_KEEP = 20

// desktop: new Date().toISOString().replace(/[:.]/g, '-')
export function backupFileName(isoTimestamp) {
  return `${BACKUP_PREFIX}${String(isoTimestamp).replace(/[:.]/g, '-')}${BACKUP_EXT}`
}

// Desktop sorts filenames lexicographically; ISO timestamps with '-' where
// ':' and '.' were sort identically lexicographically. Newest last.
export function isBackupName(name) {
  return name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_EXT)
}

export function selectOldBackups(names, keep = BACKUP_KEEP) {
  const backups = names.filter(isBackupName).sort()
  return backups.length > keep ? backups.slice(0, backups.length - keep) : []
}
