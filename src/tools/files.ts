import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPatch } from 'diff';
import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber, optionalString } from '../utils/json.js';
import { resolveWorkspacePath } from './paths.js';

export const listFilesTool: ToolDefinition = {
  name: 'list_files',
  description: 'List files and directories in a workspace directory.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path relative to the workspace root.' },
    },
    required: [],
    additionalProperties: false,
  },
  async run(input, context) {
    const requestedPath = optionalString(input.path, 'path') ?? '.';
    const dir = resolveWorkspacePath(context.cwd, requestedPath);
    const entries = await readdir(dir, { withFileTypes: true });
    const lines = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        const details = await stat(fullPath);
        const suffix = entry.isDirectory() ? '/' : '';
        return `${entry.name}${suffix}\t${details.size} bytes`;
      }),
    );
    return lines.sort().join('\n') || '(empty)';
  },
};

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read a UTF-8 text file from the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the workspace root.' },
      offset: { type: 'number', description: 'Optional 1-based line offset.' },
      limit: { type: 'number', description: 'Optional maximum number of lines.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  async run(input, context) {
    const filePath = resolveWorkspacePath(context.cwd, asString(input.path, 'path'));
    const content = await readFile(filePath, 'utf8');
    const offset = optionalNumber(input.offset, 'offset');
    const limit = optionalNumber(input.limit, 'limit');
    if (offset === undefined && limit === undefined) {
      return content;
    }
    const lines = content.split('\n');
    const start = Math.max((offset ?? 1) - 1, 0);
    const end = limit === undefined ? lines.length : start + limit;
    return lines.slice(start, end).map((line, index) => `${start + index + 1}|${line}`).join('\n');
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Write a UTF-8 file inside the workspace. Creates parent directories as needed.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the workspace root.' },
      content: { type: 'string', description: 'Full file content.' },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  async run(input, context) {
    const filePath = resolveWorkspacePath(context.cwd, asString(input.path, 'path'));
    const content = asString(input.content, 'content');
    if (context.dryRun) {
      return `[dry-run] Would write ${content.length} bytes to ${path.relative(context.cwd, filePath)}`;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    return `Wrote ${content.length} bytes to ${path.relative(context.cwd, filePath)}`;
  },
};

export const editFileTool: ToolDefinition = {
  name: 'edit_file',
  description: 'Replace an exact text range in a UTF-8 file inside the workspace.',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the workspace root.' },
      oldText: { type: 'string', description: 'Exact text to replace.' },
      newText: { type: 'string', description: 'Replacement text.' },
    },
    required: ['path', 'oldText', 'newText'],
    additionalProperties: false,
  },
  async run(input, context) {
    const filePath = resolveWorkspacePath(context.cwd, asString(input.path, 'path'));
    const oldText = asString(input.oldText, 'oldText');
    const newText = asString(input.newText, 'newText');
    const before = await readFile(filePath, 'utf8');
    if (!before.includes(oldText)) {
      return `No changes: exact oldText was not found in ${path.relative(context.cwd, filePath)}`;
    }
    const after = before.replace(oldText, newText);
    const patch = createPatch(path.relative(context.cwd, filePath), before, after);
    if (context.dryRun) {
      return `[dry-run] Would apply patch:\n${patch}`;
    }
    await writeFile(filePath, after, 'utf8');
    return `Applied patch:\n${patch}`;
  },
};

export const fileTools = [listFilesTool, readFileTool, writeFileTool, editFileTool];
