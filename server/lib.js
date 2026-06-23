// Reviewable Markdown — testable server core.
//
// All pure/IO logic lives here so it can be unit-tested without starting a
// server or spawning Vite. cli.js wires this up to argv and a listening socket.

import http from 'node:http'
import fsp from 'node:fs/promises'
import path from 'node:path'

export function parseArgs(argv) {
  const args = { port: 5174, open: true, file: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') args.port = parseInt(argv[++i], 10)
    else if (a === '--no-open') args.open = false
    else if (!a.startsWith('-')) args.file = a
  }
  return args
}

// Path of the review JSON sidecar for a given markdown file.
export function reviewPathFor(mdPath) {
  return mdPath.replace(/\.md$/i, '') + '.review.json'
}

export async function readComments(reviewPath) {
  try {
    const raw = await fsp.readFile(reviewPath, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.comments) ? data.comments : []
  } catch {
    return []
  }
}

export async function writeComments(reviewPath, mdPath, comments, now = new Date()) {
  const payload = {
    file: path.basename(mdPath),
    updatedAt: now.toISOString(),
    comments,
  }
  await fsp.writeFile(reviewPath, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

async function serveStatic(dist, req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (pathname === '/') pathname = '/index.html'
  const filePath = path.join(dist, pathname)
  if (!filePath.startsWith(dist)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  try {
    const data = await fsp.readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    const html = await fsp.readFile(path.join(dist, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  }
}

function proxyToVite(vitePort, req, res) {
  const proxy = http.request(
    { hostname: 'localhost', port: vitePort, path: req.url, method: req.method, headers: req.headers },
    (pr) => {
      res.writeHead(pr.statusCode, pr.headers)
      pr.pipe(res)
    },
  )
  proxy.on('error', () => {
    res.writeHead(502)
    res.end('Vite not ready')
  })
  req.pipe(proxy)
}

// Build the request handler. Options:
//   mdPath, reviewPath  — file locations
//   dev (bool)          — proxy to Vite vs serve dist
//   dist, vitePort      — used per mode
// Returns an async (req, res) handler usable with http.createServer.
export function createHandler({ mdPath, reviewPath, dev = false, dist, vitePort }) {
  return async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://x')

      if (pathname === '/api/document') {
        const markdown = await fsp.readFile(mdPath, 'utf8')
        return sendJson(res, 200, { path: path.basename(mdPath), markdown })
      }

      if (pathname === '/api/comments') {
        if (req.method === 'GET') {
          return sendJson(res, 200, { comments: await readComments(reviewPath) })
        }
        if (req.method === 'PUT') {
          const body = JSON.parse(await readBody(req))
          await writeComments(reviewPath, mdPath, body.comments || [])
          return sendJson(res, 200, { ok: true })
        }
      }

      if (pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'Not found' })
      }

      if (dev) return proxyToVite(vitePort, req, res)
      return serveStatic(dist, req, res)
    } catch (e) {
      sendJson(res, 500, { error: String(e) })
    }
  }
}
