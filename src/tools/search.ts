import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';
import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber } from '../utils/json.js';
import { resolveWorkspacePath } from './paths.js';

const DEFAULT_IGNORES = ['.git', 'node_modules', 'dist', 'coverage', '.mimo-code'];

export const searchTool: ToolDefinition = {
  name: 'search_text',
  description: 'Search text files in the workspace using a JavaScript regular expression.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'JavaScript regular expression.' },
      path: { type: 'string', description: 'Directory path relative to the workspace root.' },
      maxResults: { type: 'number', description: 'Maximum results to return.' },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async run(input, context) {
    const pattern = asString(input.pattern, 'pattern');
    const searchRoot = resolveWorkspacePath(context.cwd, typeof input.path === 'string' ? input.path : '.');
    const maxResults = optionalNumber(input.maxResults, 'maxResults') ?? 100;
    const matcher = new RegExp(pattern, 'iu');
    const ig = ignore().add(DEFAULT_IGNORES);
    const results: string[] = [];
    await walk(searchRoot, context.cwd, ig, async (file) => {
      if (results.length >= maxResults) return;
      const content = await readFile(file, 'utf8').catch(() => undefined);
      if (content === undefined || content.includes('\0')) return;
      const lines = content.split('\n');
      for (const [index, line] of lines.entries()) {
        if (matcher.test(line)) {
          results.push(`${path.relative(context.cwd, file)}:${index + 1}: ${line}`);
          if (results.length >= maxResults) return;
        }
      }
    });
    return results.join('\n') || 'No matches';
  },
};

async function walk(root: string, cwd: string, ig: ReturnType<typeof ignore>, onFile: (file: string) => Promise<void>): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    const relative = path.relative(cwd, fullPath);
    if (ig.ignores(relative)) continue;
    if (entry.isDirectory()) {
      await walk(fullPath, cwd, ig, onFile);
    } else if (entry.isFile()) {
      await onFile(fullPath);
    }
  }
}
