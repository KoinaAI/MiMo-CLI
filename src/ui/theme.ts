import chalk from 'chalk';
import { formatUsage, formatCost } from '../agent/usage.js';
import type { CostEstimate, InteractionMode, RuntimeConfig, SessionRecord, ToolDefinition, TokenUsage } from '../types.js';

/**
 * The splash banner shown when the TUI launches. Aimed at a Codex/Claude-Code
 * feel: a tight boxed mark, the product name, and a single tagline. The
 * branding tagline `Intelligent Coding Agent` is asserted by tests.
 */
export const SPLASH = [
  `${chalk.cyan('Welcome to MiMo Code')} ${chalk.dim('v0.1.0')}`,
  chalk.dim('……………………………………………………………………………………'),
  '                                                          ',
  `      ${chalk.cyan('█████████')}                         ${chalk.dim('░░░░░░')}`,
  `      ${chalk.cyan('██▄███▄██')}                       ${chalk.dim('░░░░░░░░░░')}`,
  `      ${chalk.cyan('█████████')}                       ${chalk.dim('░░░░░░░░░░')}`,
  '                                                          ',
  `${chalk.dim('…………………………………………')} ${chalk.cyan('█ █   █ █')} ${chalk.dim('……………………')}`,
  `${chalk.dim('/help for commands')} ${chalk.dim('·')} ${chalk.dim('/settings for config')} ${chalk.dim('·')} ${chalk.dim('Shift+Tab switches mode')}`,
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
    chalk.gray('anthropic'),
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
  return lines.map((line) => chalk.gray.italic(`  · ${line}`)).join('\n');
}

export function formatToolCallHeader(name: string, input: Record<string, unknown>): string {
  const inputSummary = Object.entries(input)
    .map(([key, value]) => {
      const v = typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60);
      return `${key}=${v}`;
    })
    .join(', ');
  return chalk.yellow(`  ⏵ ${name}`) + chalk.gray(`(${inputSummary})`);
}

export function formatToolResult(name: string, content: string): string {
  const lines = content.split('\n');
  const truncated = lines.length > 20
    ? [...lines.slice(0, 18), chalk.gray(`  ... (${lines.length - 18} more lines)`)].join('\n')
    : content;
  return chalk.gray(`  ↪ ${name}: `) + truncated;
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
    plan: '◇',
    agent: '◆',
    yolo: '▲',
  };
  return `${icons[mode]} ${MODE_LABELS[mode]}`;
}

/**
 * Map a tool name to a short verb describing what it does. Used by the live
 * status indicator so the spinner reads "Reading...", "Editing...", etc.
 */
export function verbForTool(toolName: string): string {
  const map: Record<string, string> = {
    read_file: 'Reading',
    read_many_files: 'Reading',
    list_files: 'Listing',
    search_text: 'Searching',
    file_search: 'Searching',
    glob: 'Searching',
    web_fetch: 'Fetching',
    web_search: 'Searching',
    write_file: 'Writing',
    edit_file: 'Editing',
    multi_edit: 'Editing',
    apply_patch: 'Patching',
    run_shell: 'Running',
    git_status: 'Inspecting',
    git_diff: 'Diffing',
    git_log: 'Inspecting',
    git_commit: 'Committing',
    git_blame: 'Inspecting',
    todo_add: 'Planning',
    todo_update: 'Planning',
    todo_list: 'Planning',
    sub_agent: 'Delegating',
    ask_user: 'Asking',
  };
  if (map[toolName]) return map[toolName] ?? 'Working';
  if (toolName.startsWith('mcp__')) return 'Calling';
  if (toolName.startsWith('agent_')) return 'Delegating';
  return 'Working';
}

export interface WorkflowSummary {
  builtinTools: number;
  mcpServers: number;
  mcpTools: number;
  configuredSkills: number;
  discoveredSkills: number;
  hooks: number;
  subagents: number;
}

export function formatWorkflowSummary(summary: WorkflowSummary): string {
  return [
    `${chalk.bold('Harness')}      ${chalk.cyan(String(summary.builtinTools))} built-in · ${chalk.cyan(String(summary.mcpTools))} MCP tools`,
    `${chalk.bold('Context')}      ${chalk.cyan(String(summary.configuredSkills + summary.discoveredSkills))} skills · ${chalk.cyan(String(summary.subagents))} Named subagents`,
    `${chalk.bold('Automation')}   ${chalk.cyan(String(summary.mcpServers))} MCP servers · ${chalk.cyan(String(summary.hooks))} hooks`,
    '',
    chalk.dim('Use /mcp, /skills, /hooks, /agents, /tools, /doctor for details.'),
  ].join('\n');
}

/** Restrained sigils for transcript line prefixes. Avoids emoji clutter. */
export const SIGILS = {
  user: chalk.green('▎'),
  assistant: chalk.cyan('▎'),
  thinking: chalk.gray('▎'),
  tool: chalk.yellow('⏵'),
  toolResult: chalk.gray('↪'),
  system: chalk.gray('•'),
  error: chalk.red('✖'),
  diff: chalk.magenta('±'),
};

export function shortenPath(cwd: string): string {
  const home = process.env.HOME ?? '';
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

/**
 * Compact top-bar summary used by the TUI's persistent status row.
 */
export function topStatusLine(
  config: RuntimeConfig,
  cwd: string,
  mode: InteractionMode,
  branch: string | undefined,
  contextSummary: string,
): string {
  const parts = [
    chalk.bold.cyan('MiMo'),
    MODE_LABELS[mode],
    chalk.yellow(config.model),
    chalk.gray(shortenPath(cwd)),
  ];
  if (branch) parts.push(chalk.magenta(`⎇ ${branch}`));
  if (contextSummary) parts.push(chalk.gray(contextSummary));
  return parts.join(chalk.dim(' · '));
}
