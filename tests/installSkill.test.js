import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { installSkill, skillTargets } from '../server/installSkill.js'

describe('installSkill', () => {
  let dir, source

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'rmd-skill-'))
    source = path.join(dir, 'source-skill')
    await fsp.mkdir(path.join(source, 'agents'), { recursive: true })
    await fsp.writeFile(path.join(source, 'SKILL.md'), '---\nname: reviewable-md\ndescription: test\n---\n')
    await fsp.writeFile(path.join(source, 'agents', 'openai.yaml'), 'interface:\n  display_name: "Reviewable Markdown"\n')
  })

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true })
  })

  it('reports Claude and Codex targets', () => {
    expect(skillTargets(dir).map((target) => target.path)).toEqual([
      path.join(dir, '.claude', 'skills', 'reviewable-md'),
      path.join(dir, '.codex', 'skills', 'reviewable-md'),
    ])
  })

  it('copies the bundled skill into both global skill directories', async () => {
    const result = await installSkill({ source, home: dir })

    expect(result).toHaveLength(2)
    for (const target of result) {
      await expect(fsp.readFile(path.join(target.path, 'SKILL.md'), 'utf8')).resolves.toContain('reviewable-md')
      await expect(fsp.readFile(path.join(target.path, 'agents', 'openai.yaml'), 'utf8')).resolves.toContain('Reviewable Markdown')
    }
  })

  it('does not write files in dry-run mode', async () => {
    const result = await installSkill({ source, home: dir, dryRun: true })

    expect(result.every((target) => target.dryRun)).toBe(true)
    for (const target of result) {
      await expect(fsp.stat(target.path)).rejects.toThrow()
    }
  })

  it('updates an existing skill directory', async () => {
    const [target] = skillTargets(dir)
    await fsp.mkdir(target.path, { recursive: true })
    await fsp.writeFile(path.join(target.path, 'SKILL.md'), 'old')

    await installSkill({ source, home: dir, force: true })

    await expect(fsp.readFile(path.join(target.path, 'SKILL.md'), 'utf8')).resolves.toContain('reviewable-md')
  })
})
