#!/usr/bin/env node
import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'CLAUDE.md');
const dest = join(root, 'AGENTS.md');

if (!existsSync(src)) {
  console.error(`Source file not found: ${src}`);
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`Synced CLAUDE.md → AGENTS.md`);
