import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const SKILL_NAME = 'reviewable-md'

export function skillTargets(home = os.homedir()) {
  return [
    {
      name: 'Claude',
      path: path.join(home, '.claude', 'skills', SKILL_NAME),
    },
    {
      name: 'Codex',
      path: path.join(home, '.codex', 'skills', SKILL_NAME),
    },
  ]
}

async function copySkill(source, target, { force = false } = {}) {
  await fsp.mkdir(path.dirname(target), { recursive: true })
  if (force) {
    await fsp.rm(target, { recursive: true, force: true })
  }
  await fsp.cp(source, target, { recursive: true, force: true })
}

export async function installSkill({
  source,
  home = os.homedir(),
  dryRun = false,
  force = false,
} = {}) {
  if (!source) throw new Error('Missing bundled skill source path')
  const targets = skillTargets(home)
  if (!dryRun) {
    await Promise.all(targets.map((target) => copySkill(source, target.path, { force })))
  }
  return targets.map((target) => ({
    ...target,
    source,
    dryRun,
  }))
}
