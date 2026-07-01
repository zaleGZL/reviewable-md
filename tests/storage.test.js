import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  documentKeyForPath,
  fetchServerDocument,
  loadDocument,
  loadLastDocument,
  saveComments,
  saveDocument,
  saveLayout,
} from '../src/storage.js'

function deleteDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  await deleteDb('reviewable-md')
})

describe('documentKeyForPath', () => {
  it('uses the absolute file path as the document key', () => {
    expect(documentKeyForPath('/tmp/a.md')).toBe('/tmp/a.md')
  })
})

describe('fetchServerDocument', () => {
  it('loads a markdown document through the local server API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        key: '/tmp/a.md',
        path: '/tmp/a.md',
        name: 'a.md',
        markdown: '# A',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const doc = await fetchServerDocument('/tmp/a.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/document?path=%2Ftmp%2Fa.md')
    expect(doc).toEqual({
      key: '/tmp/a.md',
      path: '/tmp/a.md',
      markdown: '# A',
      fileMeta: {
        name: 'a.md',
        source: 'server',
      },
    })

    vi.unstubAllGlobals()
  })

  it('throws the server error message when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'ENOENT' }),
    }))

    await expect(fetchServerDocument('/tmp/missing.md')).rejects.toThrow('ENOENT')

    vi.unstubAllGlobals()
  })
})

describe('document storage', () => {
  it('returns null when there is no recent document', async () => {
    expect(await loadLastDocument()).toBeNull()
  })

  it('saves and restores the most recent document', async () => {
    await saveDocument({ key: 'a.md', path: 'a.md', markdown: '# A' }, [{ id: 'c1' }])

    expect(await loadLastDocument()).toMatchObject({
      key: 'a.md',
      path: 'a.md',
      markdown: '# A',
      comments: [{ id: 'c1' }],
    })
  })

  it('loads a document by key', async () => {
    await saveDocument({ key: 'a.md', path: 'a.md', markdown: '# A' }, [])

    expect(await loadDocument('a.md')).toMatchObject({
      key: 'a.md',
      markdown: '# A',
      comments: [],
    })
  })

  it('updates comments for an existing document', async () => {
    await saveDocument({ key: 'a.md', path: 'a.md', markdown: '# A' }, [])
    await saveComments('a.md', [{ id: 'c1', body: 'Review this.' }])

    expect((await loadDocument('a.md')).comments).toEqual([{ id: 'c1', body: 'Review this.' }])
  })

  it('rejects comment saves when the document is missing', async () => {
    await expect(saveComments('missing.md', [])).rejects.toThrow('No document is loaded')
  })

  it('persists a layout preference independently per document', async () => {
    await saveDocument({ key: 'a.md', path: 'a.md', markdown: '# A' }, [])
    await saveDocument({ key: 'b.md', path: 'b.md', markdown: '# B' }, [])

    await saveLayout('a.md', { fullWidth: true })

    expect((await loadDocument('a.md')).layout).toEqual({ fullWidth: true })
    expect((await loadDocument('b.md')).layout).toBeNull()
  })

  it('rejects layout saves when the document is missing', async () => {
    await expect(saveLayout('missing.md', { fullWidth: true })).rejects.toThrow('No document is loaded')
  })
})
