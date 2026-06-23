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

// Raw HTTP GET that preserves the literal request path. The global fetch()
// normalizes "%2e%2e" away, so it cannot exercise the traversal guard.
function rawGet(port, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath }, (res) => {
      let body = ''
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}

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

  it('serves an existing static asset with the right MIME type', async () => {
    await fsp.mkdir(path.join(dir, 'assets'))
    await fsp.writeFile(path.join(dir, 'assets', 'app.css'), 'body{color:red}')
    const res = await fetch(`${base}/assets/app.css`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/css')
    expect(await res.text()).toBe('body{color:red}')
  })

  it('serves "/" as index.html', async () => {
    await fsp.writeFile(path.join(dir, 'index.html'), '<!doctype html>root')
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html')
    expect(await res.text()).toContain('root')
  })

  it('uses octet-stream for unknown extensions', async () => {
    await fsp.writeFile(path.join(dir, 'data.bin'), 'x')
    const res = await fetch(`${base}/data.bin`)
    expect(res.headers.get('content-type')).toBe('application/octet-stream')
  })

  it('rejects path traversal with 403', async () => {
    // Raw request: fetch() would normalize the encoded dots away.
    const res = await rawGet(server.address().port, '/%2e%2e/%2e%2e/etc/passwd')
    expect(res.status).toBe(403)
    expect(res.body).toBe('Forbidden')
  })

  it('returns 500 JSON when the markdown file cannot be read', async () => {
    await fsp.rm(mdPath) // remove the file the handler tries to read
    const res = await fetch(`${base}/api/document`)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/ENOENT|Error/)
  })

  it('returns 500 JSON when the PUT body is not valid JSON', async () => {
    const res = await fetch(`${base}/api/comments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json {{{',
    })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBeTruthy()
  })
})

describe('createHandler dev mode (proxy)', () => {
  let upstream, upstreamPort, server, base

  beforeEach(async () => {
    // A fake "Vite" upstream the handler should proxy to.
    upstream = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('from upstream ' + req.url)
    })
    await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
    upstreamPort = upstream.address().port

    const handler = createHandler({
      mdPath: '/nonexistent.md',
      reviewPath: '/nonexistent.review.json',
      dev: true,
      vitePort: upstreamPort,
    })
    server = http.createServer(handler)
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(async () => {
    server.closeAllConnections?.()
    upstream.closeAllConnections?.()
    await new Promise((r) => server.close(r))
    // upstream may already be closed by the 502 test; close() errors if so.
    await new Promise((r) => upstream.close(() => r()))
  })

  it('proxies non-API requests to the Vite upstream', async () => {
    const res = await fetch(`${base}/src/main.jsx`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('from upstream /src/main.jsx')
  })

  it('still serves /api/* itself rather than proxying', async () => {
    const res = await fetch(`${base}/api/comments`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ comments: [] })
  })

  it('returns 502 when the upstream is unreachable', async () => {
    // Close the upstream so the proxy connection fails.
    upstream.closeAllConnections?.()
    await new Promise((r) => upstream.close(r))
    const res = await fetch(`${base}/whatever`)
    expect(res.status).toBe(502)
    expect(await res.text()).toBe('Vite not ready')
  })
})
