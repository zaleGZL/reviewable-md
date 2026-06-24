import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  documentKeyForFile,
  loadDocument,
  loadLastDocument,
  readMarkdownFile,
  saveComments,
  saveDocument,
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

describe('documentKeyForFile', () => {
  it('uses the file name as the document key', () => {
    expect(documentKeyForFile(new File(['# A'], 'a.md'))).toBe('a.md')
  })
})

describe('readMarkdownFile', () => {
  it('reads markdown content and file metadata', async () => {
    const file = new File(['# A'], 'a.md', { type: 'text/markdown', lastModified: 1000 })
    const doc = await readMarkdownFile(file)

    expect(doc).toMatchObject({
      key: 'a.md',
      path: 'a.md',
      markdown: '# A',
      fileMeta: {
        name: 'a.md',
        size: 3,
        lastModified: 1000,
      },
    })
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
})
