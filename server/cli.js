#!/usr/bin/env node
// Reviewable Markdown — local server entrypoint.
//
// Usage:
//   reviewable-md <file.md> [--port 27174] [--no-open]
//
// Serves a single markdown file with a review UI. Comments are persisted to
// `<file>.review.json` next to the markdown so an AI can read them directly.
//
// In dev (this repo) it spawns Vite and proxies non-/api requests to it.
// When packaged, it serves the built client from ../dist instead.
//
// All request/IO logic lives in lib.js so it can be unit-tested.

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { spawn } from 'node:child_process'
import { DEFAULT_PORT, parseArgs, reviewPathFor, createHandler } from './lib.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

const args = parseArgs(process.argv.slice(2))
if (!args.file) {
  console.error(`Usage: reviewable-md <file.md> [--port ${DEFAULT_PORT}] [--no-open]`)
  process.exit(1)
}

const MD_PATH = path.resolve(process.cwd(), args.file)
if (!fs.existsSync(MD_PATH)) {
  console.error(`File not found: ${MD_PATH}`)
  process.exit(1)
}
const REVIEW_PATH = reviewPathFor(MD_PATH)

// Decide dev vs packaged. Force dev with RMD_DEV=1 (npm run dev); otherwise
// serve the built client if dist/ exists, else fall back to running Vite.
const DEV = process.env.RMD_DEV === '1' || !fs.existsSync(DIST)
const VITE_PORT = args.port + 1

const handler = createHandler({
  mdPath: MD_PATH,
  reviewPath: REVIEW_PATH,
  dev: DEV,
  dist: DIST,
  vitePort: VITE_PORT,
})

const server = http.createServer(handler)

const previewPort = DEV ? VITE_PORT : args.port
const link = `http://localhost:${previewPort}`

function openBrowser() {
  if (!args.open) return
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(opener, [link], { shell: true, stdio: 'ignore', detached: true }).unref()
}

let viteProc = null
if (DEV) {
  viteProc = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  })
  let viteReady = false
  viteProc.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    if (!viteReady && /ready in/.test(chunk)) {
      viteReady = true
      openBrowser()
    }
  })
  process.on('exit', () => viteProc?.kill())
  process.on('SIGINT', () => { viteProc?.kill(); process.exit(0) })
}

server.listen(args.port, '127.0.0.1', () => {
  console.log(`\n  Reviewable Markdown`)
  console.log(`  file:     ${MD_PATH}`)
  console.log(`  comments: ${REVIEW_PATH}`)
  console.log(`  preview:  ${link}\n`)
  if (!DEV) openBrowser()
})
