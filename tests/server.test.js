import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  parseArgs,
  reviewPathFor,
  readComments,
  writeComments,
  createHandler,
} from '../server/lib.js'

describe('parseArgs', () => {
  it('defaults port to 5174 and open to true', () => {
    expect(parseArgs(['doc.md'])).toEqual({ port: 5174, open: true, file: 'doc.md' })
  })

  it('parses --port', () => {
    expect(parseArgs(['doc.md', '--port', '9000']).port).toBe(9000)
  })

  it('parses --no-open', () => {
    expect(parseArgs(['doc.md', '--no-open']).open).toBe(false)
  })

  it('treats the first non-flag argument as the file', () => {
    expect(parseArgs(['--no-open', 'a.md']).file).toBe('a.md')
  })
})

describe('reviewPathFor', () => {
  it('replaces the .md extension with .review.json', () => {
    expect(reviewPathFor('/x/doc.md')).toBe('/x/doc.review.json')
  })

  it('is case-insensitive on the extension', () => {
    expect(reviewPathFor('/x/DOC.MD')).toBe('/x/DOC.review.json')
  })
})

describe('comment persistence', () => {
  let dir, mdPath, reviewPath

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rmd-test-'))
    mdPath = path.join(dir, 'doc.md')
    reviewPath = reviewPathFor(mdPath)
    await fsp.writeFile(mdPath, '# Doc\n')
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('returns an empty array when no review file exists', async () => {
    expect(await readComments(reviewPath)).toEqual([])
  })

  it('round-trips comments through write and read', async () => {
    const comments = [{ id: 'c1', body: 'hi', anchor: { quote: 'Doc' } }]
    await writeComments(reviewPath, mdPath, comments)
    expect(await readComments(reviewPath)).toEqual(comments)
  })

  it('writes file name and a timestamp into the sidecar', async () => {
    const when = new Date('2026-06-23T10:00:00Z')
    await writeComments(reviewPath, mdPath, [], when)
    const raw = JSON.parse(await fsp.readFile(reviewPath, 'utf8'))
    expect(raw.file).toBe('doc.md')
    expect(raw.updatedAt).toBe('2026-06-23T10:00:00.000Z')
  })

  it('returns [] for a corrupt review file instead of throwing', async () => {
    await fsp.writeFile(reviewPath, 'not json {{{')
    expect(await readComments(reviewPath)).toEqual([])
  })
})

describe('createHandler API', () => {
  let dir, mdPath, reviewPath, server, base

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rmd-api-'))
    mdPath = path.join(dir, 'doc.md')
    reviewPath = reviewPathFor(mdPath)
    await fsp.writeFile(mdPath, '# Hello\n\nbody text\n')

    const handler = createHandler({ mdPath, reviewPath, dev: false, dist: dir, vitePort: 0 })
    server = http.createServer(handler)
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    // fetch keeps connections alive; force them closed so close() resolves fast.
    server.closeAllConnections?.()
    await new Promise((r) => server.close(r))
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('GET /api/document returns the markdown and base name', async () => {
    const res = await fetch(`${base}/api/document`)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.path).toBe('doc.md')
    expect(data.markdown).toContain('# Hello')
  })

  it('GET /api/comments is empty initially', async () => {
    const res = await fetch(`${base}/api/comments`)
    expect(await res.json()).toEqual({ comments: [] })
  })

  it('PUT then GET /api/comments persists the payload', async () => {
    const comments = [{ id: 'c1', body: 'note', anchor: { quote: 'Hello' } }]
    const put = await fetch(`${base}/api/comments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comments }),
    })
    expect(await put.json()).toEqual({ ok: true })

    const get = await fetch(`${base}/api/comments`)
    expect((await get.json()).comments).toEqual(comments)

    // And it actually hit disk.
    const onDisk = JSON.parse(await fsp.readFile(reviewPath, 'utf8'))
    expect(onDisk.comments).toEqual(comments)
  })

  it('PUT with no comments field defaults to an empty array', async () => {
    const put = await fetch(`${base}/api/comments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(put.status).toBe(200)
    expect(await readComments(reviewPath)).toEqual([])
  })

  it('unknown /api/* routes return 404 JSON', async () => {
    const res = await fetch(`${base}/api/nope`)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Not found' })
  })

  it('non-API routes fall back to serving index.html (SPA)', async () => {
    await fsp.writeFile(path.join(dir, 'index.html'), '<!doctype html><title>app</title>')
    const res = await fetch(`${base}/some/spa/route`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<title>app</title>')
  })
})
