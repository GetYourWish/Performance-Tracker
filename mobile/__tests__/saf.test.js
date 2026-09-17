// SAF adapter tests — the pure parts of the ONLY module that talks to
// Android's document provider.
//
// REGRESSION THIS GUARDS (remote-reported: 'stuck on the main page, not able
// to find the tracker.json file'):
//
//   StorageAccessFramework.readDirectoryAsync returns child URIs whose last
//   segment is the percent-encoded DOCUMENT ID
//   ('primary:Folder/tracker.json'), not the file name. The old fileNameOf
//   decoded that segment and compared it against 'tracker.json' — never a
//   match on a real device, so a tracker.json synced in via Syncthing was
//   unfindable and the app sat on the 'No tracker.json' screen forever.
//   The unit suite never caught it because the in-memory adapter builds
//   child URIs whose last segment genuinely is the file name.
//
// Also guards the SAF op timeout: a stalled document-provider call (known
// OEM behavior once a persisted folder permission goes stale) used to hang
// every awaiting screen (boot splash, 'Create default tracker.json', the
// folder picker) forever — the load() watchdog only repainted STATE, the
// promises themselves never settled.

// Stand-in for 'expo-file-system/legacy' so the adapter is exercisable in
// Node. The factory reads mockLegacyState at CALL time so a test can flip a
// provider into 'stalled' mode; every call is recorded for arg assertions.
const mockLegacyState = { stallReadDirectory: false }
const mockLegacyCalls = []

function mockMakeLegacyFs(state) {
  return {
    EncodingType: { UTF8: 'utf8' },
    documentDirectory: 'file://data/user/0/pt/docs/',
    StorageAccessFramework: {
      requestDirectoryPermissionsAsync: async () => ({
        granted: true,
        directoryUri: 'content://picked/tree'
      }),
      readDirectoryAsync: async dirUri => {
        mockLegacyCalls.push(['readDirectoryAsync', dirUri])
        if (state.stallReadDirectory) return new Promise(() => {}) // OEM stall: never settles
        return []
      },
      createFileAsync: async (parentUri, mimeType, fileName) => {
        mockLegacyCalls.push(['createFileAsync', parentUri, mimeType, fileName])
        return parentUri + '/' + encodeURIComponent(fileName)
      }
    },
    readAsStringAsync: async (uri, opts) => {
      mockLegacyCalls.push(['readAsStringAsync', uri, opts])
      return '{}'
    },
    writeAsStringAsync: async (uri, content, opts) => {
      mockLegacyCalls.push(['writeAsStringAsync', uri, content, opts])
    },
    deleteAsync: async (uri, opts) => {
      mockLegacyCalls.push(['deleteAsync', uri, opts])
    },
    getInfoAsync: async uri => {
      mockLegacyCalls.push(['getInfoAsync', uri])
      return { exists: true, size: 2, modificationTime: 5 }
    },
    makeDirectoryAsync: async () => {}
  }
}

jest.mock('expo-file-system/legacy', () => mockMakeLegacyFs(mockLegacyState), { virtual: true })

const {
  fileNameOf,
  withTimeout,
  SAF_OP_TIMEOUT_MS,
  createSafAdapter,
  requestFolder
} = require('../src/storage/saf.js')

// ---------------------------------------------------------------------------
// fileNameOf — real Android document-provider URI shapes
// ---------------------------------------------------------------------------

const EXT = 'content://com.android.externalstorage.documents'

describe('fileNameOf with real SAF document URIs', () => {
  test('external-storage child: document id is the full path, name is its last segment', () => {
    const uri =
      EXT + '/tree/primary%3ASyncthing%2FTracker/document/primary%3ASyncthing%2FTracker%2Ftracker.json'
    expect(fileNameOf(uri)).toBe('tracker.json')
  })

  test('deeply nested external-storage child', () => {
    const uri =
      EXT +
      '/tree/primary%3Adata%2Fsync/document/primary%3Adata%2Fsync%2Fdevices%2Fphone%2Ftracker.json'
    expect(fileNameOf(uri)).toBe('tracker.json')
  })

  test('Syncthing conflict copy keeps its full name (conflict detection depends on it)', () => {
    const name = 'tracker-sync-conflict-20260917-120000-X7Y8Z9.json'
    const uri =
      EXT +
      '/tree/primary%3ASyncthing%2FTracker/document/primary%3ASyncthing%2FTracker%2F' +
      encodeURIComponent(name)
    expect(fileNameOf(uri)).toBe(name)
  })

  test('temp document from the atomic-write pipeline', () => {
    const uri = EXT + '/tree/primary%3AFolder/document/primary%3AFolder%2Ftracker.json.tmp'
    expect(fileNameOf(uri)).toBe('tracker.json.tmp')
  })

  test('names with spaces and percent signs survive decoding', () => {
    expect(
      fileNameOf(EXT + '/tree/primary%3AFolder/document/primary%3AFolder%2Fmy%20tracker.json')
    ).toBe('my tracker.json')
    expect(
      fileNameOf(EXT + '/tree/primary%3AFolder/document/primary%3AFolder%2F100%25done.json')
    ).toBe('100%done.json')
  })

  test('raw:/storage/... document ids (older providers)', () => {
    const uri =
      'content://com.android.providers.downloads.documents/tree/downloads/document/' +
      encodeURIComponent('raw:/storage/emulated/0/Download/tracker.json')
    expect(fileNameOf(uri)).toBe('tracker.json')
  })

  test('unencoded hand-built document URIs (expo getUriForDirectoryInRoot style)', () => {
    expect(fileNameOf(EXT + '/tree/primary:Foo/document/primary:Foo/bar.json')).toBe('bar.json')
  })

  test('plain/simple child URIs (test adapter, simple providers) still work', () => {
    expect(fileNameOf('mem://dir/tracker.json')).toBe('tracker.json')
    expect(fileNameOf('content://test/tree/x/tracker.json')).toBe('tracker.json')
    expect(fileNameOf('content://test/tree/x/tracker.json.tmp')).toBe('tracker.json.tmp')
  })

  test('malformed percent-encoding does not throw and still yields the last segment', () => {
    expect(fileNameOf(EXT + '/tree/primary%3AFolder/document/primary%3AFolder%2F100%.json')).toBe(
      '100%.json'
    )
  })

  test('empty / falsy input', () => {
    expect(fileNameOf('')).toBe('')
    expect(fileNameOf(null)).toBe('')
    expect(fileNameOf(undefined)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// withTimeout — the anti-hang guard for document-provider calls
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  test('passes through resolved values', async () => {
    await expect(withTimeout(() => Promise.resolve(42), 'op', 50)).resolves.toBe(42)
  })

  test('passes through rejections', async () => {
    await expect(withTimeout(() => Promise.reject(new Error('boom')), 'op', 50)).rejects.toThrow(
      'boom'
    )
  })

  test('a stalled op rejects with SAF_TIMEOUT after the deadline', async () => {
    const promise = withTimeout(() => new Promise(() => {}), 'Reading the data folder', 30)
    await expect(promise).rejects.toMatchObject({
      code: 'SAF_TIMEOUT',
      op: 'Reading the data folder'
    })
  })

  test('timeout error carries an actionable message', async () => {
    await expect(
      withTimeout(() => new Promise(() => {}), 'Writing tracker.json', 10)
    ).rejects.toThrow(/Writing tracker\.json timed out.*Pick the folder again/)
  })

  test('a synchronous throw inside the op rejects (lazy expo require safety)', async () => {
    await expect(
      withTimeout(() => {
        throw new Error('module missing')
      }, 'op', 50)
    ).rejects.toThrow('module missing')
  })

  test('clears the timer once settled (no dangling timers)', async () => {
    jest.useFakeTimers()
    try {
      const p = withTimeout(() => Promise.resolve('ok'), 'op', 1000)
      await expect(p).resolves.toBe('ok')
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// createSafAdapter — every provider call is timeout-guarded, args are correct
// ---------------------------------------------------------------------------

describe('createSafAdapter', () => {
  test('listChildren rejects with SAF_TIMEOUT when the provider stalls', async () => {
    mockLegacyState.stallReadDirectory = true
    const adapter = createSafAdapter()
    jest.useFakeTimers()
    try {
      const promise = adapter.listChildren('content://folder')
      const assertion = expect(promise).rejects.toMatchObject({ code: 'SAF_TIMEOUT' })
      jest.advanceTimersByTime(SAF_OP_TIMEOUT_MS + 100)
      await assertion
    } finally {
      jest.useRealTimers()
      mockLegacyState.stallReadDirectory = false
    }
  })

  test('createDocument calls createFileAsync(parentUri, mimeType, fileName) in that order', async () => {
    mockLegacyCalls.length = 0
    const adapter = createSafAdapter()
    await adapter.createDocument('content://folder', 'tracker.json')
    expect(mockLegacyCalls).toEqual([
      ['createFileAsync', 'content://folder', 'application/json', 'tracker.json']
    ])
  })

  test('readDocument/writeDocument/removeDocument/statDocument hit the legacy fs API', async () => {
    mockLegacyCalls.length = 0
    const adapter = createSafAdapter()
    await adapter.writeDocument('content://folder/tracker.json', '{}')
    await adapter.readDocument('content://folder/tracker.json')
    await adapter.removeDocument('content://folder/tracker.json.tmp')
    const stat = await adapter.statDocument('content://folder/tracker.json')
    expect(stat).toEqual({ exists: true, size: 2, modificationTime: 5 })
    const kinds = mockLegacyCalls.map(c => c[0])
    expect(kinds).toEqual(['writeAsStringAsync', 'readAsStringAsync', 'deleteAsync', 'getInfoAsync'])
  })

  test('requestFolder maps the picker result (never timeout-guarded: user-driven)', async () => {
    const res = await requestFolder()
    expect(res).toEqual({ granted: true, directoryUri: 'content://picked/tree' })
  })
})
