import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  ensureDaemon,
  openMarkdownFile,
  readDaemonState,
  resolveMarkdownPath,
  writeDaemonState,
} from '../server/daemon.js'

describe('daemon helpers', () => {
  let dir

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rmd-daemon-'))
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('reads and writes daemon state', async () => {
    await writeDaemonState({ pid: 123, port: 27174 }, { home: dir })
    expect(await readDaemonState({ home: dir })).toMatchObject({ pid: 123, port: 27174 })
  })

  it('reuses a healthy daemon from state', async () => {
    await writeDaemonState({ pid: 123, port: 27174 }, { home: dir })

    const result = await ensureDaemon({
      home: dir,
      cliPath: '/tmp/reviewable-md.js',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ ok: true, name: 'reviewable-md' }),
      }),
      spawnImpl: () => {
        throw new Error('spawn should not be called')
      },
    })

    expect(result).toMatchObject({ pid: 123, port: 27174, reused: true })
  })

  it('starts a daemon when no healthy state exists', async () => {
    const calls = []
    const result = await ensureDaemon({
      home: dir,
      cliPath: '/tmp/reviewable-md.js',
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ ok: true, name: 'reviewable-md' }),
      }),
      spawnImpl: (cmd, args) => {
        calls.push({ cmd, args })
        return { pid: 456, unref() {} }
      },
    })

    expect(result).toMatchObject({ pid: 456, reused: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].args).toContain('serve')
    expect(calls[0].args).toContain('--daemon')
  })

  it('validates markdown paths', async () => {
    const mdPath = path.join(dir, 'doc.md')
    await fsp.writeFile(mdPath, '# Doc\n')

    expect(resolveMarkdownPath('doc.md', dir)).toBe(mdPath)
    expect(() => resolveMarkdownPath('doc.txt', dir)).toThrow('Only .md files')
    expect(() => resolveMarkdownPath('missing.md', dir)).toThrow('File not found')
  })

  it('opens a markdown file through the daemon URL without launching a browser when disabled', async () => {
    const mdPath = path.join(dir, 'doc.md')
    await fsp.writeFile(mdPath, '# Doc\n')

    const result = await openMarkdownFile(mdPath, {
      home: dir,
      cliPath: '/tmp/reviewable-md.js',
      open: false,
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ ok: true, name: 'reviewable-md' }),
      }),
      spawnImpl: () => ({ pid: 789, unref() {} }),
    })

    expect(result.file).toBe(mdPath)
    expect(result.url).toContain(encodeURIComponent(mdPath))
  })
})
