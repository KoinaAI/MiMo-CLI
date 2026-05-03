import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * "@-mention" completion for the input line, à la Codex / Claude Code.
 *
 * When the prompt contains an `@` segment ending at the cursor, we suggest
 * matching workspace files. The token is delimited by whitespace, so
 * `please summarize @src/uti` returns matches starting with `src/uti`.
 *
 * The implementation is intentionally lightweight — no fancy fuzzy match,
 * no global index — because the prompt is interactive and we want sub-50ms
 * latency on every keystroke. We walk the cwd lazily up to a small breadth
 * limit, skipping `node_modules`, `.git`, `dist`, and any path beginning
 * with `.`.
 */
export interface MentionContext {
  /** The whole token after `@`, e.g. "src/foo.ts". May be empty. */
  query: string;
  /** Index in the original prompt where the `@` lives. */
  start: number;
  /** Index in the original prompt one past the end of the token. */
  end: number;
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const MAX_RESULTS = 10;
const MAX_WALK = 800;

/**
 * Find an in-flight `@` mention at the given cursor position. Returns
 * undefined when the cursor is not inside a mention token.
 */
export function findMentionAt(value: string, cursor: number): MentionContext | undefined {
  if (cursor <= 0 || cursor > value.length) return undefined;
  let i = cursor - 1;
  // Walk backwards over the token characters.
  while (i >= 0) {
    const ch = value[i];
    if (ch === undefined) return undefined;
    if (/\s/.test(ch)) return undefined;
    if (ch === '@') {
      // Must be at column 0 or preceded by whitespace, otherwise it's part
      // of a word like "user@host".
      if (i > 0 && !/\s/.test(value[i - 1] ?? ' ')) return undefined;
      const query = value.slice(i + 1, cursor);
      // Don't trigger on `@@` or `@/` heuristics; the slash in `@src/foo` is fine.
      if (query.includes(' ')) return undefined;
      return { query, start: i, end: cursor };
    }
    i -= 1;
  }
  return undefined;
}

/**
 * Replace the `@token` segment with a chosen path. The cursor moves to the
 * end of the inserted path so the user can keep typing.
 */
export function applyMention(value: string, ctx: MentionContext, replacement: string): { value: string; cursor: number } {
  const before = value.slice(0, ctx.start);
  const after = value.slice(ctx.end);
  const inserted = `@${replacement}`;
  const next = `${before}${inserted}${after}`;
  return { value: next, cursor: before.length + inserted.length };
}

/**
 * Walk the workspace and return up to {@link MAX_RESULTS} relative paths
 * that match the given query. Matching is case-insensitive substring on
 * the basename, with a preference for paths that start with the query
 * (so typing "rea" surfaces "README.md" before "tests/unread.txt").
 */
export async function suggestMentions(cwd: string, query: string): Promise<string[]> {
  const matches: { rel: string; score: number }[] = [];
  const lc = query.toLowerCase();
  let visited = 0;
  await walk(cwd, '', async (rel) => {
    visited += 1;
    if (visited > MAX_WALK) return false;
    const base = path.basename(rel).toLowerCase();
    if (lc === '' || base.includes(lc) || rel.toLowerCase().includes(lc)) {
      const score = scoreMatch(rel, lc);
      matches.push({ rel, score });
    }
    return true;
  });
  matches.sort((a, b) => b.score - a.score || a.rel.length - b.rel.length || a.rel.localeCompare(b.rel));
  return matches.slice(0, MAX_RESULTS).map((m) => m.rel);
}

function scoreMatch(rel: string, query: string): number {
  if (!query) return 0;
  const base = path.basename(rel).toLowerCase();
  if (base === query) return 100;
  if (base.startsWith(query)) return 80;
  if (base.includes(query)) return 60;
  if (rel.toLowerCase().includes(query)) return 40;
  return 10;
}

async function walk(root: string, rel: string, onEntry: (rel: string) => Promise<boolean>): Promise<void> {
  const dir = rel ? path.join(root, rel) : root;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP.has(entry.name)) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const cont = await onEntry(childRel);
      if (!cont) return;
      await walk(root, childRel, onEntry);
    } else if (entry.isFile()) {
      const cont = await onEntry(childRel);
      if (!cont) return;
    }
  }
}

/**
 * Expand `@path` mentions in a prompt body into inline file references the
 * model will read. Each mention is replaced with a fenced block that
 * includes the path and the file contents (truncated to 4 KB per file so a
 * stray mention can't blow up the context window).
 *
 * Returns the rewritten prompt and the list of files that were inlined,
 * which the TUI surfaces as a small "attached" notice.
 */
export interface ExpandedPrompt {
  prompt: string;
  attached: string[];
  missing: string[];
}

export async function expandMentions(prompt: string, readFile: (rel: string) => Promise<string>): Promise<ExpandedPrompt> {
  const re = /(^|\s)@([^\s@][^\s]*)/gu;
  const attached: string[] = [];
  const missing: string[] = [];
  const replacements: { match: string; replacement: string }[] = [];
  for (const match of prompt.matchAll(re)) {
    const rel = match[2] ?? '';
    if (!rel) continue;
    if (rel.endsWith('/')) continue;
    try {
      const content = await readFile(rel);
      const truncated = content.length > 4096 ? `${content.slice(0, 4096)}\n... [truncated]` : content;
      const block = `${match[1] ?? ''}<file path="${rel}">\n${truncated}\n</file>`;
      replacements.push({ match: match[0], replacement: block });
      attached.push(rel);
    } catch {
      missing.push(rel);
    }
  }
  let next = prompt;
  for (const { match, replacement } of replacements) {
    const idx = next.indexOf(match);
    if (idx >= 0) {
      next = `${next.slice(0, idx)}${replacement}${next.slice(idx + match.length)}`;
    }
  }
  return { prompt: next, attached, missing };
}
