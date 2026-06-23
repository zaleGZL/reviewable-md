import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchDocument, fetchComments, saveComments } from '../src/api.js'

function okResponse(json) {
  return { ok: true, status: 200, json: async () => json }
}
function errResponse(status) {
  return { ok: false, status, json: async () => ({}) }
}

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchDocument', () => {
  it('GETs /api/document and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ path: 'a.md', markdown: '# A' }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/document')
    expect(out).toEqual({ path: 'a.md', markdown: '# A' })
  })

  it('throws with the status code on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errResponse(500)))
    await expect(fetchDocument()).rejects.toThrow('Failed to load document: 500')
  })
})

describe('fetchComments', () => {
  it('GETs /api/comments and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ comments: [{ id: 'c1' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const out = await fetchComments()
    expect(fetchMock).toHaveBeenCalledWith('/api/comments')
    expect(out).toEqual({ comments: [{ id: 'c1' }] })
  })

  it('throws with the status code on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errResponse(404)))
    await expect(fetchComments()).rejects.toThrow('Failed to load comments: 404')
  })
})

describe('saveComments', () => {
  it('PUTs the comments as JSON and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const comments = [{ id: 'c1', body: 'hi' }]
    const out = await saveComments(comments)

    expect(out).toEqual({ ok: true })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/comments')
    expect(opts.method).toBe('PUT')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(opts.body)).toEqual({ comments })
  })

  it('throws with the status code on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errResponse(503)))
    await expect(saveComments([])).rejects.toThrow('Failed to save comments: 503')
  })
})
