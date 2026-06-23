#!/usr/bin/env node
// Reviewable Markdown — local server.
//
// Usage:
//   reviewable-md <file.md> [--port 5174] [--no-open]
//
// Serves a single markdown file with a review UI. Comments are persisted to
// `<file>.review.json` next to the markdown so an AI can read them directly.
//
// In dev (this repo) it spawns Vite and proxies non-/api requests to it.
// When packaged, it serves the built client from ../dist instead.

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import url from 'node:url'
import { spawn } from 'node:child_process'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

function parseArgs(argv) {
  const args = { port: 5174, open: true, file: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') args.port = parseInt(argv[++i], 10)
    else if (a === '--no-open') args.open = false
    else if (!a.startsWith('-')) args.file = a
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
if (!args.file) {
  console.error('Usage: reviewable-md <file.md> [--port 5174] [--no-open]')
  process.exit(1)
}

const MD_PATH = path.resolve(process.cwd(), args.file)
if (!fs.existsSync(MD_PATH)) {
  console.error(`File not found: ${MD_PATH}`)
  process.exit(1)
}
const REVIEW_PATH = MD_PATH.replace(/\.md$/i, '') + '.review.json'

// Decide dev vs packaged. Force dev with RMD_DEV=1 (npm run dev); otherwise
// serve the built client if dist/ exists, else fall back to running Vite.
const DEV = process.env.RMD_DEV === '1' || !fs.existsSync(DIST)
const VITE_PORT = args.port + 1

async function readComments() {
  try {
    const raw = await fsp.readFile(REVIEW_PATH, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.comments) ? data.comments : []
  } catch {
    return []
  }
}

async function writeComments(comments) {
  const payload = {
    file: path.basename(MD_PATH),
    updatedAt: new Date().toISOString(),
    comments,
  }
  await fsp.writeFile(REVIEW_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8')
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(body)
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

async function serveStatic(req, res) {
  let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (pathname === '/') pathname = '/index.html'
  let filePath = path.join(DIST, pathname)
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  try {
    const data = await fsp.readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    // SPA fallback
    const html = await fsp.readFile(path.join(DIST, 'index.html'))
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  }
}

function proxyToVite(req, res) {
  const opts = {
    hostname: 'localhost',
    port: VITE_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  }
  const proxy = http.request(opts, (pr) => {
    res.writeHead(pr.statusCode, pr.headers)
    pr.pipe(res)
  })
  proxy.on('error', () => {
    res.writeHead(502)
    res.end('Vite not ready')
  })
  req.pipe(proxy)
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x')

    if (pathname === '/api/document') {
      const markdown = await fsp.readFile(MD_PATH, 'utf8')
      return sendJson(res, 200, { path: path.basename(MD_PATH), markdown })
    }

    if (pathname === '/api/comments') {
      if (req.method === 'GET') {
        return sendJson(res, 200, { comments: await readComments() })
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody(req))
        await writeComments(body.comments || [])
        return sendJson(res, 200, { ok: true })
      }
    }

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Not found' })
    }

    if (DEV) return proxyToVite(req, res)
    return serveStatic(req, res)
  } catch (e) {
    sendJson(res, 500, { error: String(e) })
  }
})

let viteProc = null
if (DEV) {
  viteProc = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  process.on('exit', () => viteProc?.kill())
  process.on('SIGINT', () => { viteProc?.kill(); process.exit(0) })
}

server.listen(args.port, '127.0.0.1', () => {
  const link = `http://localhost:${args.port}`
  console.log(`\n  Reviewable Markdown`)
  console.log(`  file:     ${MD_PATH}`)
  console.log(`  comments: ${REVIEW_PATH}`)
  console.log(`  preview:  ${link}\n`)
  if (args.open) {
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start' : 'xdg-open'
    spawn(opener, [link], { shell: true, stdio: 'ignore', detached: true }).unref()
  }
})
