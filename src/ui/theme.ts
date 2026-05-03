import chalk from 'chalk';
import { formatUsage, formatCost } from '../agent/usage.js';
import type { CostEstimate, InteractionMode, RuntimeConfig, SessionRecord, ToolDefinition, TokenUsage } from '../types.js';

/**
 * Splash banner shown when the TUI launches.
 *
 * Visual: a small cyan ANSI-Shadow wordmark, a short tagline, and three
 * onboarding hints. We keep this minimalist (Codex / Claude-Code feel) and
 * only use two colours (cyan + dim) so it sits well on any terminal theme.
 *
 * The strings `Welcome to MiMo Code` and `/settings for config` are asserted
 * by tests in `test/theme.test.ts` and `test/tui-smoke.test.tsx`; the
 * `Intelligent Coding Agent` tagline is part of the product wording.
 */
const SPLASH_LOGO = [
  '  ███╗   ███╗ ██╗ ███╗   ███╗  ██████╗ ',
  '  ████╗ ████║ ██║ ████╗ ████║ ██╔═══██╗',
  '  ██╔████╔██║ ██║ ██╔████╔██║ ██║   ██║',
  '  ██║╚██╔╝██║ ██║ ██║╚██╔╝██║ ██║   ██║',
  '  ██║ ╚═╝ ██║ ██║ ██║ ╚═╝ ██║ ╚██████╔╝',
  '  ╚═╝     ╚═╝ ╚═╝ ╚═╝     ╚═╝  ╚═════╝ ',
];

export const SPLASH = [
  '',
  ...SPLASH_LOGO.map((line) => chalk.cyan(line)),
  '',
  `  ${chalk.bold('Welcome to MiMo Code')} ${chalk.dim('· Intelligent Coding Agent · v0.1.0')}`,
  '',
  `  ${chalk.dim('/help')} ${chalk.dim('for commands')} ${chalk.dim('·')} ${chalk.dim('/settings')} ${chalk.dim('for config')} ${chalk.dim('·')} ${chalk.dim('Shift+Tab')} ${chalk.dim('switches mode')}`,
  `  ${chalk.dim('@')} ${chalk.dim('to mention files')} ${chalk.dim('·')} ${chalk.dim('/')} ${chalk.dim('to run a command')} ${chalk.dim('·')} ${chalk.dim('/keys')} ${chalk.dim('for shortcuts')}`,
  '',
].join('\n');

export const MODE_LABELS: Record<InteractionMode, string> = {
  plan: chalk.blue('PLAN'),
  agent: chalk.green('AGENT'),
  yolo: chalk.red('YOLO'),
};

const SEP = chalk.dim(' · ');

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
  return parts.join(SEP);
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

/**
 * Restrained sigils used as left-hand prefixes for transcript entries.
 *
 * The transcript groups every entry under one of these markers. We keep the
 * vocabulary tight so the conversation reads as a continuous stream rather
 * than a bag of unrelated icons:
 *
 *   ▎ user / assistant — bold accent bar (green / cyan)
 *   ✢ thinking         — soft mark for reasoning blocks
 *   ·  tool call       — single dim dot, almost invisible chrome
 *   ↳ tool result      — connector that visually attaches to the call above
 *   ± diff             — magenta plus/minus to evoke a patch
 *   ✖ error            — red cross for failures
 *   •  system          — neutral dim dot
 */
export const SIGILS = {
  user: chalk.green('▎'),
  assistant: chalk.cyan('▎'),
  thinking: chalk.gray('✢'),
  tool: chalk.gray('·'),
  toolResult: chalk.gray('↳'),
  system: chalk.gray('•'),
  error: chalk.red('✖'),
  diff: chalk.magenta('±'),
};

/** Headline label shown to the right of a sigil for each transcript kind. */
export const ROLE_LABELS = {
  user: 'you',
  assistant: 'mimo',
  thinking: 'thinking',
  system: 'system',
  error: 'error',
};

export function shortenPath(cwd: string): string {
  const home = process.env.HOME ?? '';
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

/**
 * Compact top-bar summary used by the TUI's persistent status row. Renders
 * a single dim line of the form
 *
 *   ✦ MiMo  ◆ AGENT  · model · ~/repo · ⎇ branch · context …
 */
export function topStatusLine(
  config: RuntimeConfig,
  cwd: string,
  mode: InteractionMode,
  branch: string | undefined,
  contextSummary: string,
): string {
  const brand = `${chalk.cyan('✦')} ${chalk.bold.cyan('MiMo')}`;
  const parts: string[] = [
    brand,
    modeIndicator(mode),
    chalk.yellow(config.model),
    chalk.gray(shortenPath(cwd)),
  ];
  if (branch) parts.push(chalk.magenta(`⎇ ${branch}`));
  if (contextSummary) parts.push(chalk.gray(contextSummary));
  return parts.join(SEP);
}

/**
 * Subtle horizontal rule used to separate user turns in the transcript.
 *
 * The rule is sized to a sensible default that fits inside the inner
 * padding of the TUI's `<Box paddingX={1}>` container without dominating
 * the screen. Rendered in dim gray so it stays in the background.
 */
export function turnDivider(width = 56): string {
  return chalk.dim('─'.repeat(width));
}

/** Border colour to use for the input frame in each interaction mode. */
export function modeBorderColor(mode: InteractionMode): 'cyan' | 'blue' | 'red' {
  if (mode === 'plan') return 'blue';
  if (mode === 'yolo') return 'red';
  return 'cyan';
}

/** Glyph shown as the input prompt prefix for each interaction mode. */
export function modePromptGlyph(mode: InteractionMode): string {
  if (mode === 'plan') return '◇';
  if (mode === 'yolo') return '▲';
  return '✦';
}
