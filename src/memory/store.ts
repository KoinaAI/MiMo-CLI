import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MemoryNote } from '../types.js';

const MEMORY_DIR = path.join(homedir(), '.mimo-code', 'memory');
const GLOBAL_FILE = path.join(MEMORY_DIR, 'global.json');

function projectMemoryFile(cwd: string): string {
  const hash = Buffer.from(cwd).toString('base64url').slice(0, 16);
  return path.join(MEMORY_DIR, `project-${hash}.json`);
}

async function loadNotes(filePath: string): Promise<MemoryNote[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as MemoryNote[];
  } catch {
    return [];
  }
}

async function saveNotes(filePath: string, notes: MemoryNote[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(notes, null, 2), 'utf8');
}

export async function addMemoryNote(content: string, cwd: string, scope: 'project' | 'global' = 'project'): Promise<MemoryNote> {
  const note: MemoryNote = {
    id: randomUUID().slice(0, 8),
    content,
    createdAt: new Date().toISOString(),
    scope,
  };
  const filePath = scope === 'global' ? GLOBAL_FILE : projectMemoryFile(cwd);
  const notes = await loadNotes(filePath);
  notes.push(note);
  await saveNotes(filePath, notes);
  return note;
}

export async function listMemoryNotes(cwd: string): Promise<MemoryNote[]> {
  const globalNotes = await loadNotes(GLOBAL_FILE);
  const projectNotes = await loadNotes(projectMemoryFile(cwd));
  return [...globalNotes, ...projectNotes];
}

export async function deleteMemoryNote(id: string, cwd: string): Promise<boolean> {
  for (const filePath of [GLOBAL_FILE, projectMemoryFile(cwd)]) {
    const notes = await loadNotes(filePath);
    const filtered = notes.filter((note) => note.id !== id);
    if (filtered.length < notes.length) {
      await saveNotes(filePath, filtered);
      return true;
    }
  }
  return false;
}

export async function buildMemoryContext(cwd: string): Promise<string> {
  const notes = await listMemoryNotes(cwd);
  if (notes.length === 0) return '';
  return notes.map((note) => `[${note.scope}] ${note.content}`).join('\n');
}
