import fs from 'node:fs'
import fsp from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { DEFAULT_PORT } from './lib.js'

export const DAEMON_PORT_RANGE = 20

export function daemonDir(home = os.homedir()) {
  return path.join(home, '.reviewable-md')
}

export function daemonStatePath(home = os.homedir()) {
  return path.join(daemonDir(home), 'daemon.json')
}

export async function readDaemonState({ home = os.homedir() } = {}) {
  try {
    return JSON.parse(await fsp.readFile(daemonStatePath(home), 'utf8'))
  } catch {
    return null
  }
}

export async function writeDaemonState(state, { home = os.homedir() } = {}) {
  await fsp.mkdir(daemonDir(home), { recursive: true })
  await fsp.writeFile(daemonStatePath(home), `${JSON.stringify(state, null, 2)}\n`)
}

export async function probeHealth(port, { fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(`http://127.0.0.1:${port}/api/health`)
    if (!res.ok) return null
    const data = await res.json()
    return data?.ok && data?.name === 'reviewable-md' ? data : null
  } catch {
    return null
  }
}

export function canListen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, host, () => {
      server.close(() => resolve(true))
    })
  })
}

export async function findAvailablePort(preferredPort = DEFAULT_PORT, { range = DAEMON_PORT_RANGE } = {}) {
  for (let port = preferredPort; port <= preferredPort + range; port++) {
    if (await canListen(port)) return port
  }
  throw new Error(`No available port found from ${preferredPort} to ${preferredPort + range}`)
}

async function waitForHealth(port, { timeoutMs = 5000, fetchImpl = globalThis.fetch } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const health = await probeHealth(port, { fetchImpl })
    if (health) return health
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Reviewable Markdown daemon did not become ready on port ${port}`)
}

export async function ensureDaemon({
  port = DEFAULT_PORT,
  cliPath,
  home = os.homedir(),
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn,
  timeoutMs = 5000,
} = {}) {
  if (!cliPath) throw new Error('Missing CLI path for daemon startup')

  const existing = await readDaemonState({ home })
  if (existing?.port && await probeHealth(existing.port, { fetchImpl })) {
    return { ...existing, reused: true }
  }

  const selectedPort = await findAvailablePort(port)
  const child = spawnImpl(process.execPath, [
    cliPath,
    'serve',
    '--daemon',
    '--port',
    String(selectedPort),
    '--no-open',
  ], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref?.()

  const state = {
    pid: child.pid,
    port: selectedPort,
    startedAt: new Date().toISOString(),
  }
  await writeDaemonState(state, { home })
  await waitForHealth(selectedPort, { timeoutMs, fetchImpl })
  return { ...state, reused: false }
}

export function openUrl(link, { spawnImpl = spawn } = {}) {
  const opener = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawnImpl(opener, [link], { shell: true, stdio: 'ignore', detached: true }).unref?.()
}

export function resolveMarkdownPath(filePath, cwd = process.cwd()) {
  if (!filePath) throw new Error('Missing markdown file path')
  const mdPath = path.resolve(cwd, filePath)
  if (!/\.md$/i.test(mdPath)) throw new Error('Only .md files are supported')
  if (!fs.existsSync(mdPath)) throw new Error(`File not found: ${mdPath}`)
  return mdPath
}

export async function openMarkdownFile(filePath, {
  cliPath,
  cwd = process.cwd(),
  open = true,
  port = DEFAULT_PORT,
  home = os.homedir(),
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn,
} = {}) {
  const mdPath = resolveMarkdownPath(filePath, cwd)
  const daemon = await ensureDaemon({ port, cliPath, home, fetchImpl, spawnImpl })
  const link = `http://localhost:${daemon.port}?path=${encodeURIComponent(mdPath)}`
  if (open) openUrl(link, { spawnImpl })
  return {
    ...daemon,
    file: mdPath,
    url: link,
  }
}
