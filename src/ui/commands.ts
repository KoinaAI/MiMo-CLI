export type SlashCommandName =
  | 'help'
  | 'config'
  | 'settings'
  | 'sessions'
  | 'new'
  | 'load'
  | 'save'
  | 'mcp'
  | 'skill'
  | 'skills'
  | 'hooks'
  | 'tools'
  | 'status'
  | 'clear'
  | 'exit'
  | 'compact'
  | 'diff'
  | 'doctor'
  | 'memory'
  | 'undo'
  | 'init'
  | 'resume'
  | 'agents'
  | 'expand'
  | 'collapse'
  | 'sandbox'
  | 'bug'
  | 'context'
  | 'mode'
  | 'model'
  | 'cost'
  | 'todo'
  | 'network'
  | 'export'
  | 'keys'
  | 'edit'
  | 'workflow'
  | 'timeline';

export interface SlashCommandSpec {
  name: SlashCommandName;
  description: string;
  usage: string;
}

export interface SlashCommand {
  name: SlashCommandName;
  args: string[];
}

export const SLASH_COMMANDS: SlashCommandSpec[] = [
  { name: 'help', usage: '/help', description: 'Show commands and shortcuts' },
  { name: 'settings', usage: '/settings', description: 'Open settings wizard' },
  { name: 'config', usage: '/config', description: 'Alias for /settings' },
  { name: 'init', usage: '/init', description: 'Scaffold .mimo-code.json + AGENTS.md for the project' },
  { name: 'sessions', usage: '/sessions', description: 'List reusable sessions' },
  { name: 'new', usage: '/new [title]', description: 'Start a new reusable session' },
  { name: 'load', usage: '/load <session-id-prefix>', description: 'Load a saved session' },
  { name: 'resume', usage: '/resume', description: 'Resume the most recently saved session' },
  { name: 'save', usage: '/save', description: 'Save current session' },
  { name: 'mcp', usage: '/mcp', description: 'Show configured MCP servers' },
  { name: 'skill', usage: '/skill', description: 'Show configured skills' },
  { name: 'skills', usage: '/skills', description: 'Discover skills from .mimo/skills and ~/.mimo-code/skills' },
  { name: 'hooks', usage: '/hooks', description: 'Show configured hooks' },
  { name: 'tools', usage: '/tools', description: 'Show all available built-in and MCP tools' },
  { name: 'agents', usage: '/agents', description: 'List named subagents from .mimo/agents/*.md' },
  { name: 'sandbox', usage: '/sandbox [read-only|workspace-write|danger-full-access]', description: 'Show or set the sandbox level' },
  { name: 'status', usage: '/status', description: 'Show runtime model/session/status details' },
  { name: 'clear', usage: '/clear', description: 'Clear visible TUI messages' },
  { name: 'exit', usage: '/exit', description: 'Exit TUI' },
  { name: 'compact', usage: '/compact', description: 'Summarize conversation to reduce context usage' },
  { name: 'diff', usage: '/diff', description: 'Show workspace git diff since session start' },
  { name: 'doctor', usage: '/doctor', description: 'Run diagnostic checks on configuration and tools' },
  { name: 'memory', usage: '/memory [note]', description: 'Add or list persistent memory notes' },
  { name: 'undo', usage: '/undo', description: 'Undo last file change (git checkout)' },
  { name: 'expand', usage: '/expand <#index|all>', description: 'Expand a collapsed transcript block' },
  { name: 'collapse', usage: '/collapse <#index|all>', description: 'Collapse a transcript block' },
  { name: 'bug', usage: '/bug <description>', description: 'Report a bug or issue' },
  { name: 'context', usage: '/context', description: 'Show current context window usage' },
  { name: 'mode', usage: '/mode [plan|agent|yolo]', description: 'Switch interaction mode' },
  { name: 'model', usage: '/model [name]', description: 'Show or switch model for this session' },
  { name: 'cost', usage: '/cost', description: 'Show accumulated cost estimate for this session' },
  { name: 'todo', usage: '/todo', description: 'Show current task checklist' },
  { name: 'network', usage: '/network [allow|deny <host>]', description: 'Show or configure network access policy' },
  { name: 'export', usage: '/export <path>', description: 'Export current session to a JSON file' },
  { name: 'keys', usage: '/keys', description: 'Show keyboard shortcuts' },
  { name: 'edit', usage: '/edit', description: 'Compose the next prompt in $EDITOR' },
  { name: 'workflow', usage: '/workflow', description: 'Show MCP, skills, hooks, subagents, and harness status' },
  { name: 'timeline', usage: '/timeline', description: 'Show a compact session activity timeline' },
];

export const SLASH_COMMAND_HELP = SLASH_COMMANDS.map((command) => `${command.usage.padEnd(40)} ${command.description}`).join('\n');

export function parseSlashCommand(input: string): SlashCommand | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return undefined;
  const [rawName, ...args] = trimmed.slice(1).split(/\s+/u).filter(Boolean);
  if (!rawName) return { name: 'help', args: [] };
  if (isSlashCommandName(rawName)) return { name: rawName, args };
  return undefined;
}

/**
 * Tab completion. When there is exactly one match, complete it. When there
 * are multiple matches and an `index` is supplied, cycle through them so
 * pressing Tab repeatedly walks the suggestion list.
 */
export function completeSlashCommand(input: string, cycleIndex = 0): string | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return undefined;
  const prefix = trimmed.slice(1);
  const matches = SLASH_COMMANDS.filter((command) => command.name.startsWith(prefix));
  if (matches.length === 0) return undefined;
  if (matches.length === 1) {
    const match = matches[0];
    return match ? `/${match.name} ` : undefined;
  }
  const wrapped = matches[cycleIndex % matches.length];
  return wrapped ? `/${wrapped.name}` : undefined;
}

export function slashCommandSuggestions(input: string): SlashCommandSpec[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return [];
  const prefix = trimmed.slice(1);
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(prefix)).slice(0, 8);
}

function isSlashCommandName(value: string): value is SlashCommandName {
  return SLASH_COMMANDS.some((command) => command.name === value);
}
