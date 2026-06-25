import http from 'node:http'
import os from 'node:os'
import fsp from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_PORT = 27174

export function getLanIps() {
  const ifaces = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254.')) {
        ips.push(iface.address)
      }
    }
  }
  return ips
}

export function parseArgs(argv) {
  const args = { port: DEFAULT_PORT, open: true, file: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') args.port = parseInt(argv[++i], 10)
    else if (a === '--no-open') args.open = false
    else if (!a.startsWith('-')) args.file = a
  }
  return args
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
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

export async function readMarkdownDocument(rawPath) {
  if (!rawPath) {
    const err = new Error('Missing path')
    err.status = 400
    throw err
  }

  const mdPath = path.resolve(rawPath)
  if (!/\.md$/i.test(mdPath)) {
    const err = new Error('Only .md files are supported')
    err.status = 400
    throw err
  }

  const markdown = await fsp.readFile(mdPath, 'utf8')
  return {
    key: mdPath,
    path: mdPath,
    name: path.basename(mdPath),
    markdown,
    source: 'server',
  }
}

async function serveStatic(dist, req, res) {
  const rawPath = req.url.split('?')[0]
  let pathname
  try {
    pathname = decodeURIComponent(rawPath)
  } catch {
    pathname = rawPath
  }
  if (pathname === '/') pathname = '/index.html'

  const filePath = path.normalize(path.join(dist, pathname))
  if (filePath !== dist && !filePath.startsWith(dist + path.sep)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }

  try {
    const data = await fsp.readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    try {
      const html = await fsp.readFile(path.join(dist, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    }
  }
}

function proxyToVite(vitePort, req, res) {
  const proxy = http.request(
    { hostname: '127.0.0.1', port: vitePort, path: req.url, method: req.method, headers: req.headers },
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

export function createHandler({ dev = false, dist, vitePort, port }) {
  return async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x')

      if (url.pathname === '/api/health') {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
        return sendJson(res, 200, {
          ok: true,
          name: 'reviewable-md',
          pid: process.pid,
        })
      }

      if (url.pathname === '/api/document') {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
        return sendJson(res, 200, await readMarkdownDocument(url.searchParams.get('path')))
      }

      if (url.pathname === '/api/network-info') {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' })
        return sendJson(res, 200, { ips: getLanIps(), port: port || DEFAULT_PORT })
      }

      if (url.pathname.startsWith('/api/')) {
        return sendJson(res, 404, { error: 'Not found' })
      }

      if (dev) return proxyToVite(vitePort, req, res)
      return await serveStatic(dist, req, res)
    } catch (e) {
      sendJson(res, e.status || 500, { error: e.message || String(e) })
    }
  }
}
