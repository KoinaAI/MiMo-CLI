#!/usr/bin/env node
import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { runConsoleAgent } from './agent/console-runner.js';
import { createSubAgentTool } from './agent/subagent.js';
import { createNamedSubagentTool, discoverNamedSubagents } from './agent/named-subagents.js';
import { configureInteractively } from './config/interactive.js';
import { DEFAULT_MAX_TOKENS, DEFAULT_TEMPERATURE, SUPPORTED_MODELS } from './constants.js';
import { envToConfig, loadConfig, projectConfigPath, readPersistedConfig, tokenPlanBaseUrl, userConfigPath } from './config/config.js';
import { describeHookConfig, runHooks } from './hooks.js';
import { createMcpTools } from './mcp/stdio.js';
import { defaultTools } from './tools/index.js';
import type { ApiFormat, HookEvent, HookPayload, InteractionMode, PersistedConfig, SandboxLevel } from './types.js';
import { errorMessage } from './utils/errors.js';
import { runTui } from './ui/tui.js';

const program = new Command();

program
  .name('mimo-code')
  .description('Terminal coding agent powered by Xiaomi MiMo models')
  .version('0.1.0')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .option('--model <model>', `model (${SUPPORTED_MODELS.join(', ')})`)
  .option('--base-url <url>', 'MiMo base URL')
  .option('--token-plan-region <region>', 'Token Plan region: cn, sgp, ams')
  .option('--format <format>', 'API format: openai or anthropic')
  .option('--max-tokens <number>', `max output tokens (default ${DEFAULT_MAX_TOKENS})`)
  .option('--temperature <number>', `sampling temperature (default ${DEFAULT_TEMPERATURE})`)
  .option('--dry-run', 'show writes and commands without changing files', false)
  .option('-y, --yes', 'auto-approve tool calls where possible', false)
  .option('--max-iterations <number>', 'maximum agent/tool loop iterations (default 12)')
  .option('--no-tui', 'use prompt-based console mode instead of the full TUI')
  .option('--mode <mode>', 'interaction mode: plan, agent, or yolo (default agent)')
  .option('--sandbox <level>', 'sandbox level: read-only, workspace-write, or danger-full-access')
  .action(async (options) => {
    await runInteractive(options);
  });

program
  .command('run')
  .description('Run a single task non-interactively')
  .argument('<task...>', 'task prompt')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .option('--model <model>', `model (${SUPPORTED_MODELS.join(', ')})`)
  .option('--base-url <url>', 'MiMo base URL')
  .option('--token-plan-region <region>', 'Token Plan region: cn, sgp, ams')
  .option('--format <format>', 'API format: openai or anthropic')
  .option('--max-tokens <number>', `max output tokens (default ${DEFAULT_MAX_TOKENS})`)
  .option('--temperature <number>', `sampling temperature (default ${DEFAULT_TEMPERATURE})`)
  .option('--dry-run', 'show writes and commands without changing files', false)
  .option('-y, --yes', 'auto-approve tool calls where possible', false)
  .option('--max-iterations <number>', 'maximum agent/tool loop iterations (default 12)')
  .option('--mode <mode>', 'interaction mode: plan, agent, or yolo (default agent)')
  .option('--sandbox <level>', 'sandbox level: read-only, workspace-write, or danger-full-access')
  .action(async (taskParts: string[], options) => {
    await runTask(taskParts.join(' '), options);
  });

program
  .command('config')
  .description('Create or update ~/.mimo-code/config.json')
  .action(async () => {
    const path = await configureInteractively();
    console.log(chalk.green(`Saved config to ${path}`));
  });

program
  .command('models')
  .description('List supported MiMo models')
  .action(() => {
    for (const model of SUPPORTED_MODELS) {
      console.log(model);
    }
  });

program
  .command('base-url')
  .description('Print a base URL for API or Token Plan usage')
  .option('--region <region>', 'Token Plan region: cn, sgp, ams')
  .action((options) => {
    console.log(options.region ? tokenPlanBaseUrl(options.region) : 'https://api.xiaomimimo.com');
  });

const mcpCmd = program
  .command('mcp')
  .description('Manage MCP server configurations');

mcpCmd
  .command('list')
  .description('List configured MCP servers')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const config = await loadWorkflowConfig(options.cwd ?? process.cwd());
    const servers = config.mcpServers ?? [];
    if (servers.length === 0) {
      console.log('No MCP servers configured.');
      return;
    }
    for (const server of servers) {
      const status = server.enabled === false ? chalk.red('[disabled]') : chalk.green('[enabled]');
      console.log(`  ${status} ${chalk.bold(server.name)} — ${server.command} ${(server.args ?? []).join(' ')}`);
    }
  });

const skillsCmd = program
  .command('skills')
  .description('Manage skill configurations');

skillsCmd
  .command('list')
  .description('List configured skills')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const config = await loadWorkflowConfig(options.cwd ?? process.cwd());
    const skills = config.skills ?? [];
    if (skills.length === 0) {
      console.log('No skills configured.');
      return;
    }
    for (const skill of skills) {
      const status = skill.enabled === false ? chalk.red('[disabled]') : chalk.green('[enabled]');
      console.log(`  ${status} ${chalk.bold(skill.name)} — ${skill.description ?? skill.path ?? 'no description'}`);
    }
  });

program
  .command('init')
  .description('Scaffold .mimo-code.json, AGENTS.md, sample skill and sample subagent for this project')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const { initProject } = await import('./config/init.js');
    const cwd = options.cwd ?? process.cwd();
    const result = await initProject(cwd);
    if (result.created.length === 0) {
      console.log(chalk.gray('Nothing to do — all scaffold files already exist.'));
    } else {
      console.log(chalk.green(`Initialized MiMo project at ${cwd}:`));
      for (const file of result.created) console.log(chalk.green(`  + ${file}`));
    }
    if (result.alreadyExisted.length > 0) {
      console.log(chalk.gray('Left untouched:'));
      for (const file of result.alreadyExisted) console.log(chalk.gray(`  · ${file}`));
    }
  });

program
  .command('doctor')
  .description('Run diagnostic checks')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const { runDiagnostics, formatDiagnostics } = await import('./doctor/checks.js');
    const config = await loadConfig(options.cwd ?? process.cwd());
    const results = await runDiagnostics(config, options.cwd ?? process.cwd());
    console.log(formatDiagnostics(results));
  });

const hooksCmd = program
  .command('hooks')
  .description('Manage hook configurations');

hooksCmd
  .command('list')
  .description('List configured hooks')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .action(async (options) => {
    const config = await loadWorkflowConfig(options.cwd ?? process.cwd());
    const hooks = config.hooks ?? [];
    if (hooks.length === 0) {
      console.log('No hooks configured.');
      return;
    }
    for (const hook of hooks) {
      const status = hook.enabled === false ? chalk.red('[disabled]') : chalk.green('[enabled]');
      console.log(`  ${status} ${describeHookConfig(hook)}`);
    }
  });

hooksCmd
  .command('run <event>')
  .description('Run configured hooks for an event with an optional JSON payload')
  .option('-C, --cwd <path>', 'workspace directory', process.cwd())
  .option('--payload <json>', 'JSON payload object', '{}')
  .action(async (event: string, options) => {
    try {
      const cwd = options.cwd ?? process.cwd();
      const config = await loadWorkflowConfig(cwd);
      const payload = parseHookPayload(options.payload, cwd);
      if (!isHookEventName(event)) throw new Error(`Unsupported hook event: ${event}`);
      const results = await runHooks(config.hooks, event, payload);
      if (results.length === 0) {
        console.log(chalk.gray('No hooks matched.'));
        return;
      }
      for (const result of results) {
        const status = result.cancelled ? chalk.red('blocked') : result.code === 0 ? chalk.green('ok') : chalk.yellow(`exit ${result.code ?? 'unknown'}`);
        console.log(`${status} ${result.hook} [${result.event}]`);
        if (result.output.trim()) console.log(chalk.gray(result.output.trim()));
      }
    } catch (error) {
      console.error(chalk.red(errorMessage(error)));
      process.exitCode = 1;
    }
  });

const sessionCmd = program
  .command('session')
  .description('Manage sessions');

sessionCmd
  .command('list')
  .description('List saved sessions')
  .action(async () => {
    const { listSessions } = await import('./session/store.js');
    const sessions = await listSessions();
    if (sessions.length === 0) {
      console.log('No saved sessions.');
      return;
    }
    for (const session of sessions) {
      const msgs = session.messages.length;
      console.log(`  ${chalk.dim(session.id.slice(0, 8))} ${chalk.bold(session.title)} (${msgs} messages, ${session.updatedAt})`);
    }
  });

sessionCmd
  .command('export <id> <output>')
  .description('Export a session to a JSON file')
  .action(async (id: string, output: string) => {
    const { exportSession } = await import('./session/store.js');
    const filePath = await exportSession(id, output);
    console.log(chalk.green(`Session exported to ${filePath}`));
  });

sessionCmd
  .command('import <file>')
  .description('Import a session from a JSON file')
  .action(async (file: string) => {
    const { importSession } = await import('./session/store.js');
    const session = await importSession(file);
    console.log(chalk.green(`Session imported as ${session.id}`));
  });

async function runTask(task: string, options: CliOptions): Promise<void> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const overrides = parseOverrides(options);
    const config = await loadConfig(cwd, overrides);
    const mcpTools = await createMcpTools(config.mcpServers, cwd);
    const allTools = [...defaultTools, ...mcpTools];
    const subAgentTool = createSubAgentTool(config, allTools);
    const namedAgents = await discoverNamedSubagents(cwd).catch(() => []);
    const dispatchTool = namedAgents.length > 0 ? [createNamedSubagentTool(config, allTools, namedAgents)] : [];
    const tools = [...allTools, subAgentTool, ...dispatchTool];
    const mode = parseMode(options.mode);
    const sandbox = parseSandbox(options.sandbox);
    await runConsoleAgent(task, config, tools, {
      cwd,
      dryRun: Boolean(options.dryRun),
      autoApprove: mode === 'yolo' || Boolean(options.yes),
      maxIterations: parsePositiveInteger(options.maxIterations ?? '12', '--max-iterations'),
      mode,
      ...(sandbox ? { sandbox } : {}),
    });
  } catch (error) {
    console.error(chalk.red(errorMessage(error)));
    process.exitCode = 1;
  }
}

async function runInteractive(options: CliOptions): Promise<void> {
  try {
    const cwd = options.cwd ?? process.cwd();
    const overrides = parseOverrides(options);
    const config = await loadConfig(cwd, overrides);
    const mcpTools = await createMcpTools(config.mcpServers, cwd);
    const allTools = [...defaultTools, ...mcpTools];
    const subAgentTool = createSubAgentTool(config, allTools);
    const namedAgents = await discoverNamedSubagents(cwd).catch(() => []);
    const dispatchTool = namedAgents.length > 0 ? [createNamedSubagentTool(config, allTools, namedAgents)] : [];
    const tools = [...allTools, subAgentTool, ...dispatchTool];
    const mode = parseMode(options.mode);
    const sandbox = parseSandbox(options.sandbox);
    const agentOptions = {
      cwd,
      dryRun: Boolean(options.dryRun),
      autoApprove: mode === 'yolo' || Boolean(options.yes),
      maxIterations: parsePositiveInteger(options.maxIterations ?? '12', '--max-iterations'),
      mode,
      ...(sandbox ? { sandbox } : {}),
    };
    if (options.tui === false) {
      const task = await input({ message: 'What should MiMo Code do?' });
      await runConsoleAgent(task, config, tools, agentOptions);
      return;
    }
    await runHooks(config.hooks, 'session_start', { cwd });
    await runTui(config, tools, agentOptions);
  } catch (error) {
    console.error(chalk.red(errorMessage(error)));
    process.exitCode = 1;
  }
}

async function loadWorkflowConfig(cwd: string): Promise<PersistedConfig> {
  const userConfig = await readPersistedConfig(userConfigPath());
  const projectConfig = await readPersistedConfig(projectConfigPath(cwd));
  return {
    ...userConfig,
    ...projectConfig,
    ...envToConfig(),
  };
}

function parseOverrides(options: CliOptions): PersistedConfig {
  const overrides: PersistedConfig = {};
  if (options.model) overrides.model = options.model;
  if (options.baseUrl) overrides.baseUrl = options.baseUrl;
  if (options.tokenPlanRegion) overrides.baseUrl = tokenPlanBaseUrl(options.tokenPlanRegion);
  if (options.format) overrides.format = options.format as ApiFormat;
  if (options.maxTokens) overrides.maxTokens = parsePositiveInteger(options.maxTokens, '--max-tokens');
  if (options.temperature) overrides.temperature = parseNonNegativeNumber(options.temperature, '--temperature');
  return overrides;
}

function parseMode(value?: string): InteractionMode {
  if (value === 'plan' || value === 'agent' || value === 'yolo') return value;
  return 'agent';
}

function parseSandbox(value?: string): SandboxLevel | undefined {
  if (value === 'read-only' || value === 'workspace-write' || value === 'danger-full-access') return value;
  return undefined;
}

function parsePositiveInteger(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: string, name: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
}

function isHookEventName(value: string): value is HookEvent {
  return [
    'session_start',
    'user_prompt',
    'before_tool',
    'pre_tool_use',
    'after_tool',
    'post_tool_use',
    'notification',
    'stop',
    'agent_done',
    'subagent_done',
  ].includes(value);
}

function parseHookPayload(raw: string, cwd: string): HookPayload {
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--payload must be a JSON object');
  }
  const record = parsed as Partial<HookPayload>;
  return {
    cwd,
    ...(typeof record.prompt === 'string' ? { prompt: record.prompt } : {}),
    ...(typeof record.toolName === 'string' ? { toolName: record.toolName } : {}),
    ...(typeof record.toolInput === 'object' && record.toolInput !== null && !Array.isArray(record.toolInput) ? { toolInput: record.toolInput as Record<string, unknown> } : {}),
    ...(typeof record.toolOutput === 'string' ? { toolOutput: record.toolOutput } : {}),
    ...(typeof record.finalMessage === 'string' ? { finalMessage: record.finalMessage } : {}),
    ...(typeof record.notification === 'string' ? { notification: record.notification } : {}),
    ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
  };
}

interface CliOptions {
  cwd?: string;
  model?: string;
  baseUrl?: string;
  tokenPlanRegion?: string;
  format?: string;
  maxTokens?: string;
  temperature?: string;
  dryRun?: boolean;
  yes?: boolean;
  maxIterations?: string;
  tui?: boolean;
  mode?: string;
  sandbox?: string;
}

await program.parseAsync();
