import { spawn } from 'node:child_process';
import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber } from '../utils/json.js';

const MAX_OUTPUT = 20_000;

function runGitCommand(args: string[], cwd: string, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, env: process.env });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve(`Git command failed: ${error.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString('utf8');
      const truncated = output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n[truncated]` : output;
      resolve(`Exit code: ${code ?? 'unknown'}\n${truncated}`.trim());
    });
  });
}

export const gitStatusTool: ToolDefinition = {
  name: 'git_status',
  description: 'Show the working tree status (modified, staged, untracked files).',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async run(_input, context) {
    return runGitCommand(['status', '--short', '--branch'], context.cwd);
  },
};

export const gitDiffTool: ToolDefinition = {
  name: 'git_diff',
  description: 'Show changes in the working tree or between commits.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'Commit, branch, or path to diff against. E.g. "HEAD", "main", or "--staged".' },
    },
    additionalProperties: false,
  },
  async run(input, context) {
    const target = typeof input.target === 'string' ? input.target : '';
    const args = ['diff', '--stat', '--patch'];
    if (target) args.push(target);
    return runGitCommand(args, context.cwd);
  },
};

export const gitLogTool: ToolDefinition = {
  name: 'git_log',
  description: 'Show recent commit history.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Number of commits to show. Default 10.' },
      path: { type: 'string', description: 'Optional file path to filter history.' },
    },
    additionalProperties: false,
  },
  async run(input, context) {
    const count = optionalNumber(input.count, 'count') ?? 10;
    const args = ['log', `--oneline`, `-n`, String(count), '--decorate'];
    if (typeof input.path === 'string') args.push('--', input.path);
    return runGitCommand(args, context.cwd);
  },
};

export const gitCommitTool: ToolDefinition = {
  name: 'git_commit',
  description: 'Stage and commit changes. Stages all modified/new files then commits with the given message.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'Commit message.' },
      paths: { type: 'string', description: 'Specific paths to stage, space-separated. Defaults to "." (all).' },
    },
    required: ['message'],
    additionalProperties: false,
  },
  async run(input, context) {
    if (context.dryRun) {
      return `[dry-run] Would commit with message: ${asString(input.message, 'message')}`;
    }
    const paths = typeof input.paths === 'string' ? input.paths : '.';
    const addResult = await runGitCommand(['add', ...paths.split(/\s+/)], context.cwd);
    if (addResult.includes('Exit code: 0') || !addResult.includes('Exit code:')) {
      return runGitCommand(['commit', '-m', asString(input.message, 'message')], context.cwd);
    }
    return `Stage failed:\n${addResult}`;
  },
};

export const gitBlameTool: ToolDefinition = {
  name: 'git_blame',
  description: 'Show line-by-line authorship for a file.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to blame.' },
    },
    required: ['path'],
    additionalProperties: false,
  },
  async run(input, context) {
    return runGitCommand(['blame', '--line-porcelain', asString(input.path, 'path')], context.cwd);
  },
};

export const gitTools: ToolDefinition[] = [gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool, gitBlameTool];
