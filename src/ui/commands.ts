export type SlashCommandName =
  | 'help'
  | 'config'
  | 'sessions'
  | 'new'
  | 'load'
  | 'save'
  | 'mcp'
  | 'skill'
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
  | 'bug'
  | 'context'
  | 'mode'
  | 'cost'
  | 'todo'
  | 'network'
  | 'export';

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
  { name: 'config', usage: '/config', description: 'Run full TUI config wizard' },
  { name: 'sessions', usage: '/sessions', description: 'List reusable sessions' },
  { name: 'new', usage: '/new [title]', description: 'Start a new reusable session' },
  { name: 'load', usage: '/load <session-id-prefix>', description: 'Load a saved session' },
  { name: 'save', usage: '/save', description: 'Save current session' },
  { name: 'mcp', usage: '/mcp', description: 'Show configured MCP servers' },
  { name: 'skill', usage: '/skill', description: 'Show configured skills' },
  { name: 'hooks', usage: '/hooks', description: 'Show configured hooks' },
  { name: 'tools', usage: '/tools', description: 'Show all available built-in and MCP tools' },
  { name: 'status', usage: '/status', description: 'Show runtime model/session/status details' },
  { name: 'clear', usage: '/clear', description: 'Clear visible TUI messages' },
  { name: 'exit', usage: '/exit', description: 'Exit TUI' },
  { name: 'compact', usage: '/compact', description: 'Summarize conversation to reduce context usage' },
  { name: 'diff', usage: '/diff', description: 'Show workspace git diff since session start' },
  { name: 'doctor', usage: '/doctor', description: 'Run diagnostic checks on configuration and tools' },
  { name: 'memory', usage: '/memory [note]', description: 'Add or list persistent memory notes' },
  { name: 'undo', usage: '/undo', description: 'Undo last file change (git checkout)' },
  { name: 'init', usage: '/init', description: 'Detect project type and generate .mimo-code.json config' },
  { name: 'bug', usage: '/bug <description>', description: 'Report a bug or issue' },
  { name: 'context', usage: '/context', description: 'Show current context window usage' },
  { name: 'mode', usage: '/mode [plan|agent|yolo]', description: 'Switch interaction mode' },
  { name: 'cost', usage: '/cost', description: 'Show accumulated cost estimate for this session' },
  { name: 'todo', usage: '/todo', description: 'Show current task checklist' },
  { name: 'network', usage: '/network [allow|deny <host>]', description: 'Show or configure network access policy' },
  { name: 'export', usage: '/export <path>', description: 'Export current session to a JSON file' },
];

export const SLASH_COMMAND_HELP = SLASH_COMMANDS.map((command) => `${command.usage.padEnd(32)} ${command.description}`).join('\n');

export function parseSlashCommand(input: string): SlashCommand | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return undefined;
  const [rawName, ...args] = trimmed.slice(1).split(/\s+/u).filter(Boolean);
  if (!rawName) return { name: 'help', args: [] };
  if (isSlashCommandName(rawName)) return { name: rawName, args };
  return undefined;
}

export function completeSlashCommand(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return undefined;
  const prefix = trimmed.slice(1);
  const matches = SLASH_COMMANDS.filter((command) => command.name.startsWith(prefix));
  const match = matches[0];
  return matches.length === 1 && match ? `/${match.name} ` : undefined;
}

export function slashCommandSuggestions(input: string): SlashCommandSpec[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return [];
  const prefix = trimmed.slice(1);
  return SLASH_COMMANDS.filter((command) => command.name.startsWith(prefix)).slice(0, 6);
}

function isSlashCommandName(value: string): value is SlashCommandName {
  return SLASH_COMMANDS.some((command) => command.name === value);
}
