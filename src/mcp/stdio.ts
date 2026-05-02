import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { McpServerConfig, ToolContext, ToolDefinition } from '../types.js';
import { MiMoCliError } from '../utils/errors.js';
import { isRecord } from '../utils/json.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpToolDescription {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export type McpToolInvoker = (
  mcpTool: McpToolDescription,
  input: Record<string, unknown>,
  context: ToolContext,
) => Promise<string>;

/**
 * Stdio-based MCP client.
 *
 * Two usage patterns are supported:
 *
 *  1. Ephemeral (legacy `listTools` -> tool calls auto-restart and shut down
 *     the child process around every invocation). Kept for backward
 *     compatibility with code that wants a quick one-shot.
 *
 *  2. Persistent (`listToolsPersistent`) — the recommended path used by
 *     {@link McpRegistry}. The child process is started once and kept alive
 *     for the lifetime of the CLI process. Tool invocations reuse the same
 *     stdio pipe, which is dramatically faster and matches what other MCP
 *     hosts (Claude Desktop, Codex) do.
 */
export class McpStdioClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private stopping = false;
  private stopped = false;
  private discoveredTools: McpToolDescription[] = [];

  constructor(private readonly config: McpServerConfig) {}

  isRunning(): boolean {
    return this.process !== undefined && !this.stopped;
  }

  async start(cwd: string): Promise<void> {
    if (this.process) return;
    this.stopping = false;
    this.stopped = false;
    this.process = spawn(this.config.command, this.config.args ?? [], {
      cwd,
      shell: false,
      env: { ...process.env, ...this.config.env },
    });
    this.process.stdout.on('data', (chunk: Buffer) => this.readData(chunk));
    this.process.stderr.on('data', () => undefined);
    this.process.on('error', (err) => {
      // Surface spawn errors (ENOENT, EACCES) to any pending request and
      // mark the client as stopped so future calls fail fast.
      this.stopped = true;
      for (const pending of this.pending.values()) {
        pending.reject(err instanceof Error ? err : new MiMoCliError(String(err)));
      }
      this.pending.clear();
    });
    this.process.on('close', () => {
      if (!this.stopping) {
        for (const pending of this.pending.values()) pending.reject(new MiMoCliError(`MCP server closed: ${this.config.name}`));
      }
      this.pending.clear();
      this.process = undefined;
      this.stopping = false;
      this.stopped = true;
    });
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'mimo-code-cli', version: '0.1.0' },
    });
    this.notify('notifications/initialized', {});
  }

  /**
   * Legacy: list tools and bind ephemeral invokers that restart the child
   * process around every call. Kept for backward compatibility — new code
   * should use {@link listToolsPersistent} via the {@link McpRegistry}.
   */
  async listTools(cwd: string): Promise<ToolDefinition[]> {
    await this.start(cwd);
    const response = await this.request('tools/list', {});
    if (!isRecord(response) || !Array.isArray(response.tools)) return [];
    this.discoveredTools = response.tools.map((tool) => parseMcpTool(tool, this.config.name));
    return this.discoveredTools.map((tool) => this.toEphemeralToolDefinition(tool));
  }

  /**
   * Persistent variant. The supplied {@link invoker} is responsible for
   * routing the call back through {@link requestPersistent}; the child
   * process is left running between invocations.
   */
  async listToolsPersistent(cwd: string, invoker: McpToolInvoker): Promise<ToolDefinition[]> {
    await this.start(cwd);
    const response = await this.request('tools/list', {});
    if (!isRecord(response) || !Array.isArray(response.tools)) return [];
    this.discoveredTools = response.tools.map((tool) => parseMcpTool(tool, this.config.name));
    return this.discoveredTools.map((tool) => this.toPersistentToolDefinition(tool, invoker));
  }

  requestPersistent(method: string, params: Record<string, unknown>): Promise<unknown> {
    return this.request(method, params);
  }

  stop(): void {
    this.stopping = true;
    this.stopped = true;
    this.process?.kill();
    this.process = undefined;
  }

  private toEphemeralToolDefinition(mcpTool: McpToolDescription): ToolDefinition {
    const description = mcpTool.description ?? `MCP tool ${mcpTool.name} from ${this.config.name}`;
    const inputSchema = mcpTool.inputSchema ?? { type: 'object', additionalProperties: true };
    return {
      name: `mcp__${this.config.name}__${mcpTool.name}`,
      description,
      inputSchema,
      run: async (input: Record<string, unknown>, context: ToolContext) => {
        try {
          await this.start(context.cwd);
          const response = await this.request('tools/call', { name: mcpTool.name, arguments: input });
          return formatMcpToolResult(response);
        } finally {
          this.stop();
        }
      },
    };
  }

  private toPersistentToolDefinition(mcpTool: McpToolDescription, invoker: McpToolInvoker): ToolDefinition {
    const description = mcpTool.description ?? `MCP tool ${mcpTool.name} from ${this.config.name}`;
    const inputSchema = mcpTool.inputSchema ?? { type: 'object', additionalProperties: true };
    return {
      name: `mcp__${this.config.name}__${mcpTool.name}`,
      description,
      inputSchema,
      run: async (input: Record<string, unknown>, context: ToolContext) => invoker(mcpTool, input, context),
    };
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.write(request as unknown as Record<string, unknown>);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new MiMoCliError(String(error)));
      }
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.process) throw new MiMoCliError(`MCP server is not running: ${this.config.name}`);
    if (this.stopped) throw new MiMoCliError(`MCP server is stopped: ${this.config.name}`);
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private readData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    while (this.buffer.includes('\n')) {
      const index = this.buffer.indexOf('\n');
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) this.handleMessage(line);
    }
  }

  private handleMessage(line: string): void {
    const message = JSON.parse(line) as unknown;
    if (!isRecord(message) || typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (isRecord(message.error)) {
      pending.reject(new MiMoCliError(JSON.stringify(message.error)));
      return;
    }
    pending.resolve(message.result);
  }
}

function parseMcpTool(tool: unknown, serverName: string): McpToolDescription {
  if (!isRecord(tool) || typeof tool.name !== 'string') throw new MiMoCliError(`Invalid MCP tool from ${serverName}`);
  return {
    name: tool.name,
    ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
    ...(isRecord(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
  };
}

/**
 * Public entry point used by the CLI to spin up MCP-backed tools.
 *
 * Routes through {@link McpRegistry} so the underlying child processes are
 * kept alive for the lifetime of the CLI process. Earlier versions of this
 * function created an ephemeral client per server which restarted on every
 * tool call — that behaviour is now opt-in via {@link McpStdioClient.listTools}.
 */
export async function createMcpTools(configs: McpServerConfig[] | undefined, cwd: string): Promise<ToolDefinition[]> {
  const { getMcpRegistry } = await import('./registry.js');
  const registry = getMcpRegistry();
  return registry.start(configs, cwd);
}

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
