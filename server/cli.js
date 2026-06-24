#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { spawn } from 'node:child_process'
import { DEFAULT_PORT, createHandler, parseArgs } from './lib.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')

const args = parseArgs(process.argv.slice(2))
const initialPath = args.file ? path.resolve(process.cwd(), args.file) : null
if (initialPath && !fs.existsSync(initialPath)) {
  console.error(`File not found: ${initialPath}`)
  process.exit(1)
}

const DEV = process.env.RMD_DEV === '1' || !fs.existsSync(DIST)
const VITE_PORT = args.port + 1
const previewPort = DEV ? VITE_PORT : args.port
const query = initialPath ? `?path=${encodeURIComponent(initialPath)}` : ''
const link = `http://localhost:${previewPort}${query}`

const server = http.createServer(createHandler({
  dev: DEV,
  dist: DIST,
  vitePort: VITE_PORT,
}))

function openBrowser() {
  if (!args.open) return
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(opener, [link], { shell: true, stdio: 'ignore', detached: true }).unref()
}

let viteProc = null
if (DEV) {
  viteProc = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(VITE_PORT), '--strictPort'], {
    cwd: ROOT,
    env: { ...process.env, RMD_SERVER_PORT: String(args.port) },
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
  console.log(`  server:  http://127.0.0.1:${args.port}`)
  console.log(`  preview: ${link}`)
  if (initialPath) console.log(`  file:    ${initialPath}`)
  console.log('')
  if (!DEV) openBrowser()
})

export { DEFAULT_PORT }
