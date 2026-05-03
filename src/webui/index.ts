import { spawn } from 'node:child_process';
import { loadConfig, tokenPlanBaseUrl } from '../config/config.js';
import { createMcpTools } from '../mcp/stdio.js';
import { createSubAgentTool } from '../agent/subagent.js';
import { createNamedSubagentTool, discoverNamedSubagents } from '../agent/named-subagents.js';
import { defaultTools } from '../tools/index.js';
import type { InteractionMode, PersistedConfig, SandboxLevel } from '../types.js';
import { startWebUIServer, type WebUIServer } from './server.js';
import type { WebUIServerOptions } from './types.js';

export interface LaunchWebUIOptions {
  cwd: string;
  host?: string;
  port?: number;
  noBrowser?: boolean;
  mode?: InteractionMode;
  sandbox?: SandboxLevel | undefined;
  dryRun?: boolean;
  autoApprove?: boolean;
  maxIterations?: number;
  model?: string | undefined;
  baseUrl?: string | undefined;
  tokenPlanRegion?: string | undefined;
  maxTokens?: number | undefined;
  temperature?: number | undefined;
  staticDir?: string | undefined;
}

export async function launchWebUI(opts: LaunchWebUIOptions): Promise<WebUIServer> {
  const overrides: PersistedConfig = {};
  if (opts.model) overrides.model = opts.model;
  if (opts.baseUrl) overrides.baseUrl = opts.baseUrl;
  if (opts.tokenPlanRegion) overrides.baseUrl = tokenPlanBaseUrl(opts.tokenPlanRegion);
  if (opts.maxTokens !== undefined) overrides.maxTokens = opts.maxTokens;
  if (opts.temperature !== undefined) overrides.temperature = opts.temperature;

  const config = await loadConfig(opts.cwd, overrides);
  const mcpTools = await createMcpTools(config.mcpServers, opts.cwd);
  const allTools = [...defaultTools, ...mcpTools];
  const subAgentTool = createSubAgentTool(config, allTools);
  const namedAgents = await discoverNamedSubagents(opts.cwd).catch(() => []);
  const dispatchTool = namedAgents.length > 0 ? [createNamedSubagentTool(config, allTools, namedAgents)] : [];
  const tools = [...allTools, subAgentTool, ...dispatchTool];

  const mode = opts.mode ?? 'agent';
  const serverOptions: WebUIServerOptions = {
    cwd: opts.cwd,
    host: opts.host ?? '127.0.0.1',
    port: opts.port ?? 0,
    open: !opts.noBrowser,
    mode,
    sandbox: opts.sandbox,
    dryRun: Boolean(opts.dryRun),
    autoApprove: mode === 'yolo' || Boolean(opts.autoApprove),
    maxIterations: opts.maxIterations ?? 12,
    noBrowser: Boolean(opts.noBrowser),
    staticDir: opts.staticDir,
  };

  const server = await startWebUIServer(config, tools, serverOptions);
  if (!opts.noBrowser) tryOpenBrowser(server.url);
  return server;
}

function tryOpenBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(command, [url], { stdio: 'ignore', detached: true, shell: platform === 'win32' });
    child.on('error', () => {
      // Browser launch failures are non-fatal; URL is printed to stdout instead.
    });
    child.unref();
  } catch {
    // Ignore — the URL is logged so users can open it manually.
  }
}
