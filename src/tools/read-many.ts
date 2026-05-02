import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ToolDefinition } from '../types.js';
import { resolveWorkspacePath } from './paths.js';

const MAX_TOTAL_SIZE = 200_000; // 200KB total across all files
const MAX_FILES = 20;

export const readManyFilesTool: ToolDefinition = {
  name: 'read_many_files',
  description: 'Read multiple files at once. More efficient than reading them one by one. Returns content of all readable files.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of file paths relative to the workspace root.',
      },
    },
    required: ['paths'],
    additionalProperties: false,
  },
  async run(input, context) {
    const rawPaths = input.paths;
    if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
      return 'Error: paths must be a non-empty array of file paths';
    }
    const paths = rawPaths.slice(0, MAX_FILES).map((p) => String(p));
    if (rawPaths.length > MAX_FILES) {
      paths.push(`... and ${rawPaths.length - MAX_FILES} more (capped at ${MAX_FILES})`);
    }
    const sections: string[] = [];
    let totalSize = 0;

    for (const filePath of paths) {
      if (totalSize >= MAX_TOTAL_SIZE) {
        sections.push(`\n--- ${filePath} ---\n[skipped: total size limit reached]`);
        continue;
      }
      const resolved = resolveWorkspacePath(context.cwd, filePath);
      try {
        let content = await readFile(resolved, 'utf8');
        if (totalSize + content.length > MAX_TOTAL_SIZE) {
          const remaining = MAX_TOTAL_SIZE - totalSize;
          content = content.slice(0, remaining) + '\n[truncated]';
        }
        totalSize += content.length;
        const relPath = path.relative(context.cwd, resolved);
        sections.push(`\n--- ${relPath} ---\n${content}`);
      } catch (error) {
        const relPath = path.relative(context.cwd, resolved);
        const msg = error instanceof Error ? error.message : String(error);
        sections.push(`\n--- ${relPath} ---\n[error: ${msg}]`);
      }
    }

    return sections.join('\n');
  },
};

export const readManyTools: ToolDefinition[] = [readManyFilesTool];
