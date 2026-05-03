#!/usr/bin/env node
import { mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sourceDir = path.join(repoRoot, 'src', 'webui', 'static');
const targetDir = path.join(repoRoot, 'dist', 'webui', 'static');

async function copyTree(src, dest) {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyTree(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

async function main() {
  try {
    await stat(sourceDir);
  } catch {
    console.warn(`build-webui: skipping, source directory missing: ${sourceDir}`);
    return;
  }
  await copyTree(sourceDir, targetDir);
  console.log(`build-webui: copied ${path.relative(repoRoot, sourceDir)} -> ${path.relative(repoRoot, targetDir)}`);
}

main().catch((error) => {
  console.error('build-webui failed:', error);
  process.exitCode = 1;
});
