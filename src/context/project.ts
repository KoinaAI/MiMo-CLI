import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Project context files to discover, in priority order.
 * Follows the conventions of Claude Code, Gemini CLI, DeepSeek TUI, etc.
 */
const PROJECT_CONTEXT_FILES = [
  'AGENTS.md',
  '.claude/instructions.md',
  'CLAUDE.md',
  '.mimo-code/instructions.md',
  '.deepseek/instructions.md',
  'GEMINI.md',
  'COPILOT.md',
  'CURSORRULES',
  '.cursorrules',
];

const MAX_CONTEXT_SIZE = 100 * 1024; // 100KB per file

export interface ProjectContext {
  path: string;
  content: string;
}

/**
 * Find the git root directory by walking up from cwd.
 */
function findGitRoot(cwd: string): string | undefined {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Discover project context files from cwd up to the git root.
 * Collects all discovered files without duplicates.
 */
export async function discoverProjectContext(cwd: string): Promise<ProjectContext[]> {
  const gitRoot = findGitRoot(cwd);
  const seen = new Set<string>();
  const results: ProjectContext[] = [];

  let current = path.resolve(cwd);
  const root = gitRoot ? path.resolve(gitRoot) : undefined;

  // Walk up from cwd to git root (or filesystem root)
  while (true) {
    for (const filename of PROJECT_CONTEXT_FILES) {
      const filePath = path.join(current, filename);
      const resolved = path.resolve(filePath);
      if (seen.has(resolved)) continue;
      seen.add(resolved);

      try {
        const content = await readFile(resolved, 'utf8');
        if (content.length > MAX_CONTEXT_SIZE) {
          results.push({ path: resolved, content: content.slice(0, MAX_CONTEXT_SIZE) + '\n[truncated]' });
        } else if (content.trim().length > 0) {
          results.push({ path: resolved, content });
        }
      } catch {
        // File doesn't exist or can't be read — skip
      }
    }

    // Stop at git root
    if (root && current === root) break;

    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }

  return results;
}

/**
 * Build a system prompt fragment from discovered project context.
 */
export function buildProjectContextPrompt(contexts: ProjectContext[]): string {
  if (contexts.length === 0) return '';
  const sections = contexts.map((ctx) => {
    const name = path.basename(ctx.path);
    return `### Project instructions (${name})\n\n${ctx.content}`;
  });
  return sections.join('\n\n---\n\n');
}
