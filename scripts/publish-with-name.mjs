#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const packageJsonPath = join(root, 'package.json')

function parseArgs(argv) {
  const args = {
    name: null,
    registry: null,
    publishArgs: [],
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--name') args.name = argv[++i]
    else if (arg === '--registry') args.registry = argv[++i]
    else args.publishArgs.push(arg)
  }

  if (!args.name) throw new Error('Missing --name')
  if (!args.registry) throw new Error('Missing --registry')
  return args
}

async function readPackageJson() {
  const text = await readFile(packageJsonPath, 'utf8')
  return {
    text,
    data: JSON.parse(text),
  }
}

async function writePackageJson(data) {
  await writeFile(packageJsonPath, `${JSON.stringify(data, null, 2)}\n`)
}

function runPublish({ registry, publishArgs }) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['publish', `--registry=${registry}`, ...publishArgs], {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`npm publish exited with code ${code}`))
    })
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const original = await readPackageJson()
  const changed = { ...original.data, name: args.name }

  try {
    await writePackageJson(changed)
    await runPublish(args)
  } finally {
    await writeFile(packageJsonPath, original.text)
  }
}

main().catch((error) => {
  console.error(error.message || String(error))
  process.exit(1)
})
