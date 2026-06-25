#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { spawn } from 'node:child_process'
import { DEFAULT_PORT, createHandler, getLanIps, parseArgs } from './lib.js'
import { openMarkdownFile } from './daemon.js'
import { installSkill } from './installSkill.js'

const CLI_PATH = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(CLI_PATH)
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const BUNDLED_SKILL = path.join(ROOT, 'skill', 'reviewable-md')

export function parseCommandArgs(argv) {
  const args = {
    port: DEFAULT_PORT,
    open: true,
    json: false,
    dryRun: false,
    force: false,
    daemon: false,
    file: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--port') {
      args.port = parseInt(argv[++i], 10)
      if (!Number.isInteger(args.port)) throw new Error('Invalid --port value')
    }
    else if (a === '--no-open') args.open = false
    else if (a === '--json') args.json = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--force') args.force = true
    else if (a === '--daemon') args.daemon = true
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`)
    else if (!a.startsWith('-') && !args.file) args.file = a
  }

  return args
}

export function isDirectCliInvocation(argvPath = process.argv[1]) {
  if (!argvPath) return false
  try {
    return fs.realpathSync(argvPath) === fs.realpathSync(CLI_PATH)
  } catch {
    return argvPath === CLI_PATH
  }
}

function printResult(data, json) {
  if (json) {
    console.log(JSON.stringify(data, null, 2))
    return
  }

  if (data.installed) {
    for (const target of data.installed) {
      const action = target.dryRun ? 'would install' : 'installed'
      console.log(`${action}: ${target.name} -> ${target.path}`)
    }
    return
  }

  console.log(`Reviewable Markdown: ${data.url}`)
  if (data.file) console.log(`file: ${data.file}`)
  console.log(data.reused ? 'daemon: reused' : `daemon: started on port ${data.port}`)
}

function openBrowser(link, enabled) {
  if (!enabled) return
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(opener, [link], { shell: true, stdio: 'ignore', detached: true }).unref()
}

function startServer({ args, initialPath = null, dev }) {
  if (initialPath && !fs.existsSync(initialPath)) {
    throw new Error(`File not found: ${initialPath}`)
  }
  if (!dev && !fs.existsSync(DIST)) {
    throw new Error('Built client not found. Run `npm run build` before starting the production server.')
  }

  const vitePort = args.port + 1
  const previewPort = dev ? vitePort : args.port
  const query = initialPath ? `?path=${encodeURIComponent(initialPath)}` : ''
  const link = `http://localhost:${previewPort}${query}`

  const server = http.createServer(createHandler({
    dev,
    dist: DIST,
    vitePort,
    port: args.port,
  }))

  let viteProc = null
  if (dev) {
    viteProc = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
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
        openBrowser(link, args.open)
      }
    })
    process.on('exit', () => viteProc?.kill())
    process.on('SIGINT', () => { viteProc?.kill(); process.exit(0) })
  }

  server.listen(args.port, '0.0.0.0', () => {
    const lanIps = getLanIps()
    console.log(`\n  Reviewable Markdown`)
    console.log(`  server:  http://127.0.0.1:${args.port}`)
    if (lanIps.length) console.log(`  network: http://${lanIps[0]}:${args.port}`)
    console.log(`  preview: ${link}`)
    if (initialPath) console.log(`  file:    ${initialPath}`)
    console.log('')
    if (!dev) openBrowser(link, args.open)
  })
}

async function main() {
  const argv = process.argv.slice(2)
  const command = argv[0]

  if (command === 'open') {
    const args = parseCommandArgs(argv.slice(1))
    const result = await openMarkdownFile(args.file, {
      cliPath: CLI_PATH,
      open: args.open,
      port: args.port,
    })
    printResult(result, args.json)
    return
  }

  if (command === 'serve') {
    const args = parseCommandArgs(argv.slice(1))
    startServer({ args, dev: false })
    return
  }

  if (command === 'install-skill') {
    const args = parseCommandArgs(argv.slice(1))
    const installed = await installSkill({
      source: BUNDLED_SKILL,
      dryRun: args.dryRun,
      force: args.force,
    })
    printResult({ installed }, args.json)
    return
  }

  const args = parseArgs(argv)
  const initialPath = args.file ? path.resolve(process.cwd(), args.file) : null
  const dev = process.env.RMD_DEV === '1' || !fs.existsSync(DIST)
  startServer({ args, initialPath, dev })
}

if (isDirectCliInvocation()) {
  main().catch((error) => {
    console.error(error.message || String(error))
    process.exit(1)
  })
}

export { DEFAULT_PORT }
