import { readdir } from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber } from '../utils/json.js';
import { resolveWorkspacePath } from './paths.js';

const DEFAULT_IGNORES = ['.git', 'node_modules', 'dist', 'coverage', '.mimo-code'];

export const fileSearchTool: ToolDefinition = {
  name: 'file_search',
  description: 'Search for files by name pattern using glob-like matching. Faster than search_text for finding files.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'File name pattern to match (case-insensitive substring). E.g. "config", "test.ts", ".json".' },
      path: { type: 'string', description: 'Directory to search in, relative to workspace root.' },
      maxResults: { type: 'number', description: 'Maximum results. Default 50.' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async run(input, context) {
    const pattern = asString(input.pattern, 'pattern').toLowerCase();
    const searchRoot = resolveWorkspacePath(context.cwd, typeof input.path === 'string' ? input.path : '.');
    const maxResults = optionalNumber(input.maxResults, 'maxResults') ?? 50;
    const ig = ignore().add(DEFAULT_IGNORES);
    const results: string[] = [];
    await walkForFiles(searchRoot, context.cwd, ig, pattern, results, maxResults);
    return results.join('\n') || 'No matching files';
  },
};

async function walkForFiles(
  root: string,
  cwd: string,
  ig: ReturnType<typeof ignore>,
  pattern: string,
  results: string[],
  maxResults: number,
): Promise<void> {
  if (results.length >= maxResults) return;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (results.length >= maxResults) return;
    const fullPath = path.join(root, entry.name);
    const relative = path.relative(cwd, fullPath);
    if (ig.ignores(relative)) continue;
    if (entry.isDirectory()) {
      await walkForFiles(fullPath, cwd, ig, pattern, results, maxResults);
    } else if (entry.name.toLowerCase().includes(pattern)) {
      results.push(relative);
    }
  }
}

export const fileSearchTools: ToolDefinition[] = [fileSearchTool];
