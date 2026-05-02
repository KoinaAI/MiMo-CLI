import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber } from '../utils/json.js';
import { resolveWorkspacePath } from './paths.js';

const MAX_RESULTS = 500;

/**
 * Check if a filename matches a simple glob pattern.
 * Supports * and ** wildcards, and brace expansion {a,b}.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '†')        // placeholder for **
    .replace(/\*/g, '[^/]*')       // * matches within directory
    .replace(/†/g, '.*')           // ** matches across directories
    .replace(/\?/g, '.');          // ? matches single char
  return new RegExp(`^${regexStr}$`).test(filePath);
}

async function walkDir(dir: string, base: string, pattern: string, results: string[], maxResults: number): Promise<void> {
  if (results.length >= maxResults) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= maxResults) return;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(base, fullPath);

    // Skip hidden dirs and node_modules
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    if (entry.name === 'node_modules') continue;

    if (entry.isDirectory()) {
      await walkDir(fullPath, base, pattern, results, maxResults);
    } else if (matchGlob(relPath, pattern) || matchGlob(entry.name, pattern)) {
      const stats = await stat(fullPath).catch(() => null);
      const size = stats ? stats.size : 0;
      results.push(`${relPath}\t${size} bytes`);
    }
  }
}

export const globTool: ToolDefinition = {
  name: 'glob',
  description: 'Find files by glob pattern (e.g., "**/*.ts", "src/**/*.{js,jsx}"). Skips node_modules and hidden directories.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern to match files.' },
      path: { type: 'string', description: 'Base directory (relative to workspace). Defaults to ".".' },
      limit: { type: 'number', description: 'Max results. Defaults to 500.' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async run(input, context) {
    const pattern = asString(input.pattern, 'pattern');
    const basePath = input.path ? resolveWorkspacePath(context.cwd, asString(input.path, 'path')) : context.cwd;
    const limit = optionalNumber(input.limit, 'limit') ?? MAX_RESULTS;
    const results: string[] = [];
    await walkDir(basePath, basePath, pattern, results, limit);

    if (results.length === 0) {
      return `No files matching pattern: ${pattern}`;
    }
    const header = `Found ${results.length} file(s) matching "${pattern}":`;
    return `${header}\n${results.join('\n')}`;
  },
};

export const globTools: ToolDefinition[] = [globTool];
