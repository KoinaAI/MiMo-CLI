import chalk from 'chalk';
import { formatUsage, formatCost } from '../agent/usage.js';
import type { CostEstimate, InteractionMode, RuntimeConfig, SessionRecord, ToolDefinition, TokenUsage } from '../types.js';

export const SPLASH = [
  '',
  chalk.cyan('  __  __ _ __  __        ____          _      '),
  chalk.cyan(' |  \\/  (_)  \\/  | ___  / ___|___   __| | ___ '),
  chalk.cyan(' | |\\/| | | |\\/| |/ _ \\| |   / _ \\ / _` |/ _ \\'),
  chalk.cyan(' | |  | | | |  | | (_) | |__| (_) | (_| |  __/'),
  chalk.cyan(' |_|  |_|_|_|  |_|\\___/ \\____\\___/ \\__,_|\\___|'),
  '',
  chalk.gray('  Intelligent Coding Agent — Type /help for commands'),
  '',
].join('\n');

export const MODE_LABELS: Record<InteractionMode, string> = {
  plan: chalk.blue('PLAN'),
  agent: chalk.green('AGENT'),
  yolo: chalk.red('YOLO'),
};

export function statusLine(
  config: RuntimeConfig,
  session: SessionRecord,
  tools: ToolDefinition[],
  usage: TokenUsage,
  cwd: string,
  mode: InteractionMode = 'agent',
  cost?: CostEstimate,
): string {
  const parts = [
    MODE_LABELS[mode],
    chalk.yellow(config.model),
    chalk.gray(`${config.format}`),
    chalk.gray(`max ${config.maxTokens}`),
    chalk.cyan(`${tools.length} tools`),
    chalk.magenta(`MCP ${config.mcpServers?.filter((server) => server.enabled !== false).length ?? 0}`),
    chalk.blue(`Skills ${config.skills?.filter((skill) => skill.enabled !== false).length ?? 0}`),
    chalk.gray(`Hooks ${config.hooks?.filter((hook) => hook.enabled !== false).length ?? 0}`),
    chalk.gray(`session ${session.id.slice(0, 8)}`),
  ];
  const costStr = formatCost(cost);
  if (costStr) parts.push(chalk.green(costStr));
  parts.push(chalk.gray(shortenPath(cwd)));
  parts.push(chalk.gray(formatUsage(usage)));
  return parts.join(chalk.gray(' · '));
}

export function formatThinkingBlock(text: string): string {
  const lines = text.split('\n');
  const formatted = lines.map((line) => chalk.gray.italic(`  💭 ${line}`)).join('\n');
  return formatted;
}

export function formatToolCallHeader(name: string, input: Record<string, unknown>): string {
  const inputSummary = Object.entries(input)
    .map(([key, value]) => {
      const v = typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60);
      return `${key}=${v}`;
    })
    .join(', ');
  return chalk.yellow(`  ⚡ ${name}`) + chalk.gray(`(${inputSummary})`);
}

export function formatToolResult(name: string, content: string): string {
  const lines = content.split('\n');
  const truncated = lines.length > 20 ? [...lines.slice(0, 18), chalk.gray(`  ... (${lines.length - 18} more lines)`)].join('\n') : content;
  return chalk.gray(`  ← ${name}: `) + truncated;
}

export function formatDiffOutput(diff: string): string {
  return diff.split('\n').map((line) => {
    if (line.startsWith('+') && !line.startsWith('+++')) return chalk.green(line);
    if (line.startsWith('-') && !line.startsWith('---')) return chalk.red(line);
    if (line.startsWith('@@')) return chalk.cyan(line);
    if (line.startsWith('diff ')) return chalk.bold(line);
    return chalk.gray(line);
  }).join('\n');
}

export function modeIndicator(mode: InteractionMode): string {
  const icons: Record<InteractionMode, string> = {
    plan: '🔍',
    agent: '🤖',
    yolo: '⚡',
  };
  return `${icons[mode]} ${MODE_LABELS[mode]}`;
}

function shortenPath(cwd: string): string {
  const home = process.env.HOME ?? '';
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}
