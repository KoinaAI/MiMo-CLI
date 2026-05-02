import { McpStdioClient } from './stdio.js';
import type { McpServerConfig, ToolContext, ToolDefinition } from '../types.js';
import { isRecord } from '../utils/json.js';

interface RegistryEntry {
  config: McpServerConfig;
  client: McpStdioClient;
  tools: ToolDefinition[];
  error?: string | undefined;
}

export interface McpServerStatus {
  name: string;
  running: boolean;
  toolCount: number;
  error?: string | undefined;
}

/**
 * Persistent MCP server registry.
 *
 * The legacy implementation in {@link McpStdioClient} restarted the child
 * process on every tool call, which was wasteful and broke servers that
 * keep in-memory state (file watchers, indexes, caches). The registry holds
 * a single long-lived client per server config, eagerly lists tools on
 * registration, and exposes them as {@link ToolDefinition}s that route back
 * through the same persistent client.
 */
export class McpRegistry {
  private entries = new Map<string, RegistryEntry>();
  private started = false;

  /**
   * Register and connect every enabled server. Returns the merged tool list
   * for the agent's tool registry. Failed servers are skipped with a logged
   * warning so a single broken MCP entry can't prevent the CLI from booting.
   */
  async start(configs: McpServerConfig[] | undefined, cwd: string): Promise<ToolDefinition[]> {
    if (this.started) return this.allTools();
    this.started = true;
    const enabled = (configs ?? []).filter((config) => config.enabled !== false);
    const tools: ToolDefinition[] = [];
    for (const config of enabled) {
      try {
        const client = new McpStdioClient(config);
        const discovered = await client.listToolsPersistent(cwd, async (mcpTool, input, context) => {
          await client.start(context.cwd);
          const response = await client.requestPersistent('tools/call', { name: mcpTool.name, arguments: input });
          return formatMcpToolResult(response);
        });
        this.entries.set(config.name, { config, client, tools: discovered });
        tools.push(...discovered);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.entries.set(config.name, { config, client: new McpStdioClient(config), tools: [], error: message });
        process.stderr.write(`MiMo: MCP server "${config.name}" failed to start: ${message}\n`);
      }
    }
    return tools;
  }

  allTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const entry of this.entries.values()) tools.push(...entry.tools);
    return tools;
  }

  status(): McpServerStatus[] {
    return [...this.entries.values()].map((entry) => ({
      name: entry.config.name,
      running: entry.client.isRunning(),
      toolCount: entry.tools.length,
      ...(entry.error ? { error: entry.error } : {}),
    }));
  }

  /** Gracefully stop every running MCP server. Safe to call multiple times. */
  async stopAll(): Promise<void> {
    for (const entry of this.entries.values()) {
      try {
        entry.client.stop();
      } catch {
        // Best effort.
      }
    }
    this.entries.clear();
    this.started = false;
  }
}

let globalRegistry: McpRegistry | undefined;

/**
 * Module-level singleton used by the agent and CLI commands so that tools
 * created during boot can outlive a single tool call.
 */
export function getMcpRegistry(): McpRegistry {
  if (!globalRegistry) {
    globalRegistry = new McpRegistry();
    process.once('exit', () => {
      void globalRegistry?.stopAll();
    });
    process.once('SIGINT', () => {
      void globalRegistry?.stopAll();
    });
  }
  return globalRegistry;
}

export type McpInvoker = (
  mcpTool: { name: string; description?: string; inputSchema?: Record<string, unknown> },
  input: Record<string, unknown>,
  context: ToolContext,
) => Promise<string>;

function formatMcpToolResult(response: unknown): string {
  if (!isRecord(response)) return JSON.stringify(response);
  if (Array.isArray(response.content)) {
    return response.content
      .map((item) => {
        if (isRecord(item) && typeof item.text === 'string') return item.text;
        return JSON.stringify(item);
      })
      .join('\n');
  }
  return JSON.stringify(response);
}
