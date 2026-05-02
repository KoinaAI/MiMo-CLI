import { formatUsage } from '../agent/usage.js';
import type { RuntimeConfig, SessionRecord, ToolDefinition, TokenUsage } from '../types.js';

export const SPLASH = [
  '  __  __ _ __  __        ____          _      ',
  ' |  \\/  (_)  \\/  | ___  / ___|___   __| | ___ ',
  ' | |\\/| | | |\\/| |/ _ \\| |   / _ \\ / _` |/ _ \\',
  ' | |  | | | |  | | (_) | |__| (_) | (_| |  __/',
  ' |_|  |_|_|_|  |_|\\___/ \\____\\___/ \\__,_|\\___|',
].join('\n');

export function statusLine(config: RuntimeConfig, session: SessionRecord, tools: ToolDefinition[], usage: TokenUsage, cwd: string): string {
  return [
    config.model,
    `${config.format}`,
    `max ${config.maxTokens}`,
    `${tools.length} tools`,
    `MCP ${config.mcpServers?.filter((server) => server.enabled !== false).length ?? 0}`,
    `Skills ${config.skills?.filter((skill) => skill.enabled !== false).length ?? 0}`,
    `Hooks ${config.hooks?.filter((hook) => hook.enabled !== false).length ?? 0}`,
    `session ${session.id.slice(0, 8)}`,
    cwd,
    formatUsage(usage),
  ].join(' · ');
}
