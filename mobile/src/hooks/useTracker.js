// useTracker — React binding for the tracker store.
//  - useSyncExternalStore keeps renders in lockstep with store state
//  - persists the picked SAF folder + auto-sync preference in AsyncStorage
//  - polls for external changes every 15 s (desktop FILE_POLL_INTERVAL_MS
//    parity) and immediately on app foreground — Android has no inotify
//  - pull-to-refresh / manual refresh route through checkExternal(true)

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createTrackerStore } from '../storage/store.js'
import { createSafAdapter } from '../storage/saf.js'

const KEY_FOLDER = 'pt.folderUri'
const KEY_AUTOSYNC = 'pt.autoSync'
export const FILE_POLL_INTERVAL_MS = 15000 // parity with desktop main.cjs

export function useTracker() {
  const [folderUri, setFolderUri] = useState(null)
  const [autoSync, setAutoSyncState] = useState(true)
  const [booted, setBooted] = useState(false)

  const storeRef = useRef(null)
  if (storeRef.current === null) {
    storeRef.current = createTrackerStore({ adapter: createSafAdapter(), dirUri: null })
  }
  const store = storeRef.current

  // bootstrap: restore persisted folder + auto-sync preference
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [savedFolder, savedAuto] = await Promise.all([
          AsyncStorage.getItem(KEY_FOLDER),
          AsyncStorage.getItem(KEY_AUTOSYNC)
        ])
        if (!alive) return
        if (typeof savedAuto === 'string') setAutoSyncState(savedAuto === '1')
        if (savedFolder) {
          setFolderUri(savedFolder)
          await store.setFolder(savedFolder)
        }
      } finally {
        if (alive) setBooted(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [store])

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)

  // external-change polling + foreground refresh (Android has no file events)
  useEffect(() => {
    if (!folderUri || !autoSync) return undefined
    const timer = setInterval(() => {
      store.checkExternal().catch(() => {})
    }, FILE_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [folderUri, autoSync, store])

  const pickFolder = useCallback(async () => {
    const adapter = (await import('../storage/saf.js')).createSafAdapter()
    const res = await adapter.requestFolder()
    if (!res.granted) return null
    await AsyncStorage.setItem(KEY_FOLDER, res.directoryUri)
    setFolderUri(res.directoryUri)
    await store.setFolder(res.directoryUri)
    return res.directoryUri
  }, [store])

  const setAutoSync = useCallback(async enabled => {
    setAutoSyncState(enabled)
    await AsyncStorage.setItem(KEY_AUTOSYNC, enabled ? '1' : '0')
  }, [])

  const refresh = useCallback(async () => {
    await store.checkExternal(true)
  }, [store])

  const forgetFolder = useCallback(async () => {
    await AsyncStorage.removeItem(KEY_FOLDER)
    setFolderUri(null)
    await store.setFolder(null)
  }, [store])

  return useMemo(
    () => ({
      store,
      state: snapshot,
      folderUri,
      autoSync,
      booted,
      pickFolder,
      setAutoSync,
      refresh,
      forgetFolder
    }),
    [store, snapshot, folderUri, autoSync, booted, pickFolder, setAutoSync, refresh, forgetFolder]
  )
}
