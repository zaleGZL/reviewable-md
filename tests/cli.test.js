import { describe, it, expect } from 'vitest'
import { symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PORT } from '../server/lib.js'
import { isDirectCliInvocation, parseCommandArgs } from '../server/cli.js'

describe('parseCommandArgs', () => {
  it('defaults command flags', () => {
    expect(parseCommandArgs([])).toEqual({
      port: DEFAULT_PORT,
      open: true,
      json: false,
      dryRun: false,
      force: false,
      daemon: false,
      file: null,
    })
  })

  it('parses open command flags and file', () => {
    expect(parseCommandArgs(['doc.md', '--port', '28000', '--no-open', '--json'])).toMatchObject({
      file: 'doc.md',
      port: 28000,
      open: false,
      json: true,
    })
  })

  it('parses install and daemon flags', () => {
    expect(parseCommandArgs(['--dry-run', '--force', '--daemon'])).toMatchObject({
      dryRun: true,
      force: true,
      daemon: true,
    })
  })

  it('rejects unknown options and invalid ports', () => {
    expect(() => parseCommandArgs(['--missing'])).toThrow('Unknown option')
    expect(() => parseCommandArgs(['--port', 'nope'])).toThrow('Invalid --port')
  })
})

describe('isDirectCliInvocation', () => {
  it('recognizes npm bin symlinks as direct CLI execution', async () => {
    const cliPath = fileURLToPath(new URL('../server/cli.js', import.meta.url))
    const dir = await fsMkdtemp()
    const link = path.join(dir, 'reviewable-md')

    try {
      await symlink(cliPath, link)
      expect(isDirectCliInvocation(link)).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

async function fsMkdtemp() {
  const { mkdtemp } = await import('node:fs/promises')
  return mkdtemp(path.join(os.tmpdir(), 'rmd-cli-'))
}
