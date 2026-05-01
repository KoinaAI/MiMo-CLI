import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { SESSIONS_DIR, USER_CONFIG_DIR } from '../constants.js';
import type { ChatMessage, SessionRecord } from '../types.js';
import { MiMoCliError } from '../utils/errors.js';
import { isRecord } from '../utils/json.js';

export function sessionsDir(): string {
  return path.join(homedir(), USER_CONFIG_DIR, SESSIONS_DIR);
}

export function createSession(title: string, cwd: string): SessionRecord {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title, cwd, createdAt: now, updatedAt: now, messages: [] };
}

export async function saveSession(session: SessionRecord): Promise<string> {
  const dir = sessionsDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const updated = { ...session, updatedAt: new Date().toISOString() };
  const filePath = path.join(dir, `${updated.id}.json`);
  await writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

export async function listSessions(): Promise<SessionRecord[]> {
  const dir = sessionsDir();
  const entries = await readdir(dir).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [] as string[];
    throw error;
  });
  const sessions = await Promise.all(
    entries.filter((entry) => entry.endsWith('.json')).map(async (entry) => readSession(path.basename(entry, '.json'))),
  );
  return sessions.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function readSession(id: string): Promise<SessionRecord> {
  const content = await readFile(path.join(sessionsDir(), `${id}.json`), 'utf8');
  return parseSession(JSON.parse(content) as unknown);
}

export async function deleteSession(id: string): Promise<void> {
  await rm(path.join(sessionsDir(), `${id}.json`), { force: true });
}

export function appendSessionMessages(session: SessionRecord, messages: ChatMessage[]): SessionRecord {
  return { ...session, messages: [...session.messages, ...messages], updatedAt: new Date().toISOString() };
}

function parseSession(value: unknown): SessionRecord {
  if (!isRecord(value)) throw new MiMoCliError('Invalid session file');
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.cwd !== 'string') {
    throw new MiMoCliError('Invalid session metadata');
  }
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' || !Array.isArray(value.messages)) {
    throw new MiMoCliError('Invalid session content');
  }
  return {
    id: value.id,
    title: value.title,
    cwd: value.cwd,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    messages: value.messages as ChatMessage[],
  };
}
