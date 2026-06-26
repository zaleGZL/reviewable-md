import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import http from 'node:http'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_PORT,
  createHandler,
  getLanIps,
  parseArgs,
  readMarkdownDocument,
} from '../server/lib.js'

function listen(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

async function close(server) {
  server.closeAllConnections?.()
  await new Promise((resolve) => server.close(resolve))
}

describe('getLanIps', () => {
  it('excludes loopback, link-local, and IPv6 addresses', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
      eth0: [
        { family: 'IPv4', internal: false, address: '192.168.1.100' },
        { family: 'IPv6', internal: false, address: 'fe80::1' },
      ],
      eth1: [{ family: 'IPv4', internal: false, address: '169.254.0.1' }],
    })
    expect(getLanIps()).toEqual(['192.168.1.100'])
    vi.restoreAllMocks()
  })

  it('returns empty array when no LAN interfaces exist', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    })
    expect(getLanIps()).toEqual([])
    vi.restoreAllMocks()
  })
})

describe('parseArgs', () => {
  it('defaults to no initial file', () => {
    expect(parseArgs([])).toEqual({ port: DEFAULT_PORT, open: true, file: null })
  })

  it('parses a file, port, and --no-open', () => {
    expect(parseArgs(['doc.md', '--port', '9000', '--no-open'])).toEqual({
      port: 9000,
      open: false,
      file: 'doc.md',
    })
  })
})

describe('readMarkdownDocument', () => {
  let dir

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rmd-server-'))
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('reads the latest markdown content from disk', async () => {
    const mdPath = path.join(dir, 'doc.md')
    await fsp.writeFile(mdPath, '# First\n')
    expect((await readMarkdownDocument(mdPath)).markdown).toBe('# First\n')

    await fsp.writeFile(mdPath, '# Second\n')
    expect((await readMarkdownDocument(mdPath)).markdown).toBe('# Second\n')
  })

  it('rejects non-markdown files', async () => {
    await expect(readMarkdownDocument(path.join(dir, 'doc.txt'))).rejects.toMatchObject({
      status: 400,
    })
  })
})

describe('createHandler', () => {
  let dir, mdPath, dist

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rmd-handler-'))
    mdPath = path.join(dir, 'doc.md')
    dist = path.join(dir, 'dist')
    await fsp.mkdir(dist)
    await fsp.writeFile(mdPath, '# Doc\n')
    await fsp.writeFile(path.join(dist, 'index.html'), '<div id="root"></div>')
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('serves /api/document from disk', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/document?path=${encodeURIComponent(mdPath)}`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        key: mdPath,
        path: mdPath,
        name: 'doc.md',
        markdown: '# Doc\n',
      })
    } finally {
      await close(server)
    }
  })

  it('serves /api/health for daemon probes', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({
        ok: true,
        name: 'reviewable-md',
      })
    } finally {
      await close(server)
    }
  })

  it('returns 404 JSON for unknown API routes', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/missing`)
      expect(res.status).toBe(404)
      expect(await res.json()).toEqual({ error: 'Not found' })
    } finally {
      await close(server)
    }
  })

  it('serves the SPA fallback for non-API routes', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/anything`)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('<div id="root"></div>')
    } finally {
      await close(server)
    }
  })

  it('returns network-info with ips array and port', async () => {
    const { server, port } = await listen(createHandler({ dist, port: 9999 }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/network-info`)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data.ips)).toBe(true)
      expect(data.port).toBe(9999)
    } finally {
      await close(server)
    }
  })

  it('proxies non-API requests in dev mode', async () => {
    const vite = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(`proxied:${req.url}`)
    })
    const app = await listen(createHandler({ dev: true, vitePort: vite.port }))

    try {
      const res = await fetch(`http://127.0.0.1:${app.port}/ui`)
      expect(await res.text()).toBe('proxied:/ui')
    } finally {
      await close(app.server)
      await close(vite.server)
    }
  })

  it('POST /api/document writes content to disk', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: mdPath, markdown: '# Updated\n' }),
      })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(await fsp.readFile(mdPath, 'utf8')).toBe('# Updated\n')
    } finally {
      await close(server)
    }
  })

  it('POST /api/document returns 400 for non-.md path', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    const txtPath = path.join(dir, 'doc.txt')
    await fsp.writeFile(txtPath, 'hello')
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: txtPath, markdown: 'changed' }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/\.md/)
    } finally {
      await close(server)
    }
  })

  it('POST /api/document returns 400 for missing path or markdown', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: mdPath }),
      })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/Missing/)
    } finally {
      await close(server)
    }
  })

  it('POST /api/document returns 500 when file does not exist', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path.join(dir, 'nonexistent.md'), markdown: '# x' }),
      })
      expect(res.status).toBe(500)
    } finally {
      await close(server)
    }
  })

  it('POST /api/document returns 400 for invalid JSON body', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })
      expect(res.status).toBe(400)
    } finally {
      await close(server)
    }
  })

  it('GET /api/document reflects content written by POST', async () => {
    const { server, port } = await listen(createHandler({ dist }))
    try {
      await fetch(`http://127.0.0.1:${port}/api/document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: mdPath, markdown: '# Written\n' }),
      })
      const res = await fetch(`http://127.0.0.1:${port}/api/document?path=${encodeURIComponent(mdPath)}`)
      expect((await res.json()).markdown).toBe('# Written\n')
    } finally {
      await close(server)
    }
  })
})
