// Storage Access Framework adapter — the ONLY module in the Android app that
// talks to Android's document provider. Every higher layer (store, screens)
// goes through the FsAdapter interface implemented here, which keeps the
// tracker store fully unit-testable in Node with an in-memory adapter.
//
// Import strategy: expo-file-system moved its string/SAF APIs to
// `expo-file-system/legacy` in SDK 54; older SDKs export them at the root.
// The lazy require keeps this module (and its expo dependency) out of the
// Node test environment.

let _fs = null
function expoFs() {
  if (!_fs) {
    try {
      _fs = require('expo-file-system/legacy') // SDK 54+
    } catch (e) {
      _fs = require('expo-file-system') // older SDKs
    }
  }
  return _fs
}

function SAF() {
  return expoFs().StorageAccessFramework
}

const JSON_MIME = 'application/json'

// SAF directory URIs end with the (percent-encoded) document id; the display
// name is the segment after the last '/'.
export function fileNameOf(uri) {
  const last = uri.substring(uri.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last)
  } catch (e) {
    return last
  }
}

export async function requestFolder() {
  const res = await SAF().requestDirectoryPermissionsAsync()
  if (!res || !res.granted) return { granted: false, directoryUri: null }
  return { granted: true, directoryUri: res.directoryUri }
}

// Returns an array of child document URIs for the picked tree.
export async function listChildren(dirUri) {
  const uris = await SAF().readDirectoryAsync(dirUri)
  return Array.isArray(uris) ? uris : []
}

export async function findChildByName(dirUri, name) {
  const children = await listChildren(dirUri)
  for (const uri of children) {
    if (fileNameOf(uri) === name) return uri
  }
  return null
}

// NOTE: SAF createDocument dedupes names on collision ("tracker (1).json"),
// so callers MUST remove a same-name document via removeDocument() first.
export async function createDocument(dirUri, name, mime = JSON_MIME) {
  return SAF().createFileAsync(dirUri, mime, name)
}

export async function removeDocument(uri) {
  await expoFs().deleteAsync(uri, { idempotent: true })
}

export async function readDocument(uri) {
  return expoFs().readAsStringAsync(uri, { encoding: expoFs().EncodingType.UTF8 })
}

export async function writeDocument(uri, content) {
  await expoFs().writeAsStringAsync(uri, content, { encoding: expoFs().EncodingType.UTF8 })
}

export async function statDocument(uri) {
  try {
    const info = await expoFs().getInfoAsync(uri)
    if (!info || !info.exists) return null
    return { exists: true, size: info.size, modificationTime: info.modificationTime }
  } catch (e) {
    return null
  }
}

// ---- App-private area (internal storage, NOT in the Syncthing folder) ----
// Used for the rolling .backups window: backup copies must not be synced to
// peers, so they live in the app's own documents directory.

export function appDocumentsDir() {
  return expoFs().documentDirectory
}

export async function ensureAppDir(dirUri) {
  await expoFs().makeDirectoryAsync(dirUri, { intermediates: true })
}

export async function appWriteFile(fileUri, content) {
  // writeAsStringAsync creates missing file:// documents
  await expoFs().writeAsStringAsync(fileUri, content, { encoding: expoFs().EncodingType.UTF8 })
}

export async function appListDir(dirUri) {
  try {
    const uris = await expoFs().readDirectoryAsync(dirUri)
    return Array.isArray(uris) ? uris : []
  } catch (e) {
    return []
  }
}

export async function appDelete(uri) {
  await expoFs().deleteAsync(uri, { idempotent: true })
}

// The FsAdapter instance handed to the tracker store.
export function createSafAdapter() {
  return {
    requestFolder,
    listChildren,
    findChildByName,
    createDocument,
    removeDocument,
    readDocument,
    writeDocument,
    statDocument,
    fileNameOf,
    // internal area
    appDocumentsDir,
    ensureAppDir,
    appWriteFile,
    appListDir,
    appDelete
  }
}
