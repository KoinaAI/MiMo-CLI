export type SlashCommandName =
  | 'help'
  | 'config'
  | 'sessions'
  | 'new'
  | 'load'
  | 'save'
  | 'mcp'
  | 'skill'
  | 'clear'
  | 'exit';

export interface SlashCommand {
  name: SlashCommandName;
  args: string[];
}

export const SLASH_COMMAND_HELP = [
  '/help                         Show commands',
  '/config                       Run full TUI config wizard',
  '/sessions                     List reusable sessions',
  '/new [title]                  Start a new reusable session',
  '/load <session-id-prefix>     Load a saved session',
  '/save                         Save current session',
  '/mcp                          Show configured MCP servers',
  '/skill                        Show configured skills',
  '/clear                        Clear visible TUI messages',
  '/exit                         Exit TUI',
].join('\n');

export function parseSlashCommand(input: string): SlashCommand | undefined {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return undefined;
  const [rawName, ...args] = trimmed.slice(1).split(/\s+/u).filter(Boolean);
  if (!rawName) return { name: 'help', args: [] };
  if (isSlashCommandName(rawName)) return { name: rawName, args };
  return undefined;
}

function isSlashCommandName(value: string): value is SlashCommandName {
  return ['help', 'config', 'sessions', 'new', 'load', 'save', 'mcp', 'skill', 'clear', 'exit'].includes(value);
}
