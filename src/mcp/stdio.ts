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

export class McpStdioClient {
  private process: ChildProcessWithoutNullStreams | undefined;
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private stopping = false;
  private stopped = false;
  private discoveredTools: McpToolDescription[] = [];

  constructor(private readonly config: McpServerConfig) {}

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

  async listTools(cwd: string): Promise<ToolDefinition[]> {
    await this.start(cwd);
    const response = await this.request('tools/list', {});
    if (!isRecord(response) || !Array.isArray(response.tools)) return [];
    this.discoveredTools = response.tools.map((tool) => parseMcpTool(tool, this.config.name));
    return this.discoveredTools.map((tool) => this.toToolDefinition(tool));
  }

  stop(): void {
    this.stopping = true;
    this.stopped = true;
    this.process?.kill();
    this.process = undefined;
  }

  private toToolDefinition(mcpTool: McpToolDescription): ToolDefinition {
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

export async function createMcpTools(configs: McpServerConfig[] | undefined, cwd: string): Promise<ToolDefinition[]> {
  const enabled = (configs ?? []).filter((config) => config.enabled !== false);
  const tools: ToolDefinition[] = [];
  for (const config of enabled) {
    const client = new McpStdioClient(config);
    tools.push(...(await client.listTools(cwd)));
  }
  return tools;
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
