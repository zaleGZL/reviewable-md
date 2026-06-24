import { describe, it, expect } from 'vitest'
import { DEFAULT_PORT } from '../server/lib.js'
import { parseCommandArgs } from '../server/cli.js'

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
