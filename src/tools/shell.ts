import { spawn } from 'node:child_process';
import type { ToolDefinition } from '../types.js';
import { asString, optionalNumber } from '../utils/json.js';
import { analyzeCommand, formatSafetyResult } from './safety.js';

const MAX_OUTPUT = 20_000;

export const shellTool: ToolDefinition = {
  name: 'run_shell',
  description: 'Run a shell command in the workspace. Use for tests, builds, and safe project commands. Dangerous commands are flagged for approval.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to run with the system shell.' },
      timeoutMs: { type: 'number', description: 'Timeout in milliseconds. Defaults to 120000.' },
    },
    required: ['command'],
    additionalProperties: false,
  },
  async run(input, context) {
    const command = asString(input.command, 'command');
    const timeoutMs = optionalNumber(input.timeoutMs, 'timeoutMs') ?? 120_000;
    if (context.dryRun) {
      return `[dry-run] Would run: ${command}`;
    }
    const safety = analyzeCommand(command);
    if (safety.level === 'dangerous') {
      const warning = formatSafetyResult(safety);
      return `${warning}\nCommand blocked. Use Agent or YOLO mode with explicit approval.`;
    }
    const safetyNote = safety.level === 'moderate' ? `${formatSafetyResult(safety)}\n` : '';
    const result = await runCommand(command, context.cwd, timeoutMs);
    return safetyNote ? `${safetyNote}${result}` : result;
  },
};

async function runCommand(command: string, cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve(`Command failed to start: ${error.message}`);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString('utf8');
      const truncated = output.length > MAX_OUTPUT ? `${output.slice(0, MAX_OUTPUT)}\n[truncated]` : output;
      resolve(`Exit code: ${code ?? 'unknown'}${signal ? ` (signal ${signal})` : ''}\n${truncated}`.trim());
    });
  });
}
