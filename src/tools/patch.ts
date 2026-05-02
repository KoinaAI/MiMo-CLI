import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createPatch } from 'diff';
import type { ToolDefinition } from '../types.js';
import { asString } from '../utils/json.js';
import { resolveWorkspacePath } from './paths.js';

export const applyPatchTool: ToolDefinition = {
  name: 'apply_patch',
  description: 'Apply a unified diff patch to one or more files. Supports creating new files and multi-file patches.',
  inputSchema: {
    type: 'object',
    properties: {
      patch: { type: 'string', description: 'Unified diff patch content.' },
    },
    required: ['patch'],
    additionalProperties: false,
  },
  async run(input, context) {
    const patch = asString(input.patch, 'patch');
    if (context.dryRun) {
      return `[dry-run] Would apply patch:\n${patch}`;
    }
    const results: string[] = [];
    const hunks = parsePatchHunks(patch);
    for (const hunk of hunks) {
      const filePath = resolveWorkspacePath(context.cwd, hunk.filePath);
      let before = '';
      try {
        before = await readFile(filePath, 'utf8');
      } catch {
        // new file
      }
      const after = applyHunkLines(before, hunk.additions, hunk.removals);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, after, 'utf8');
      results.push(`Patched ${hunk.filePath} (${hunk.additions.length} additions, ${hunk.removals.length} removals)`);
    }
    return results.join('\n') || 'No changes applied';
  },
};

export const multiEditTool: ToolDefinition = {
  name: 'multi_edit',
  description: 'Apply multiple exact text replacements to a file in one atomic operation.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to workspace.' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            oldText: { type: 'string', description: 'Text to find.' },
            newText: { type: 'string', description: 'Replacement text.' },
          },
          required: ['oldText', 'newText'],
        },
        description: 'Array of {oldText, newText} replacements applied sequentially.',
      },
    },
    required: ['path', 'edits'],
    additionalProperties: false,
  },
  async run(input, context) {
    const filePath = resolveWorkspacePath(context.cwd, asString(input.path, 'path'));
    if (!Array.isArray(input.edits)) return 'edits must be an array';
    let content = await readFile(filePath, 'utf8');
    const before = content;
    let applied = 0;
    for (const edit of input.edits) {
      if (typeof edit !== 'object' || edit === null) continue;
      const rec = edit as Record<string, unknown>;
      const oldText = typeof rec.oldText === 'string' ? rec.oldText : '';
      const newText = typeof rec.newText === 'string' ? rec.newText : '';
      if (oldText && content.includes(oldText)) {
        content = content.replace(oldText, newText);
        applied += 1;
      }
    }
    if (applied === 0) return 'No edits matched';
    if (context.dryRun) {
      const diff = createPatch(path.relative(context.cwd, filePath), before, content);
      return `[dry-run] Would apply ${applied} edits:\n${diff}`;
    }
    await writeFile(filePath, content, 'utf8');
    const diff = createPatch(path.relative(context.cwd, filePath), before, content);
    return `Applied ${applied} edits:\n${diff}`;
  },
};

interface PatchHunk {
  filePath: string;
  additions: string[];
  removals: string[];
}

function parsePatchHunks(patch: string): PatchHunk[] {
  const hunks: PatchHunk[] = [];
  const lines = patch.split('\n');
  let currentFile = '';
  let additions: string[] = [];
  let removals: string[] = [];

  for (const line of lines) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const filePart = line.slice(4).replace(/^[ab]\//, '').trim();
      if (line.startsWith('+++ ') && filePart !== '/dev/null') {
        if (currentFile && (additions.length > 0 || removals.length > 0)) {
          hunks.push({ filePath: currentFile, additions, removals });
        }
        currentFile = filePart;
        additions = [];
        removals = [];
      }
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      removals.push(line.slice(1));
    }
  }
  if (currentFile && (additions.length > 0 || removals.length > 0)) {
    hunks.push({ filePath: currentFile, additions, removals });
  }
  return hunks;
}

function applyHunkLines(before: string, additions: string[], removals: string[]): string {
  let content = before;
  for (const removal of removals) {
    const index = content.indexOf(removal);
    if (index >= 0) {
      const lineStart = content.lastIndexOf('\n', index) + 1;
      const lineEnd = content.indexOf('\n', index);
      content = content.slice(0, lineStart) + content.slice(lineEnd === -1 ? content.length : lineEnd + 1);
    }
  }
  if (additions.length > 0) {
    const addBlock = additions.join('\n');
    content = content ? `${content}\n${addBlock}` : addBlock;
  }
  return content;
}

export const patchTools: ToolDefinition[] = [applyPatchTool, multiEditTool];
