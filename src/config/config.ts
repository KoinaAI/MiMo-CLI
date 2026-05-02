import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  MODEL_MAX_OUTPUT_TOKENS,
  PROJECT_CONFIG_FILE,
  SUPPORTED_MODELS,
  TOKEN_PLAN_REGIONS,
  USER_CONFIG_DIR,
  USER_CONFIG_FILE,
} from '../constants.js';
import type { ApiFormat, HookEvent, PersistedConfig, RuntimeConfig } from '../types.js';
import { MiMoCliError } from '../utils/errors.js';
import { isRecord, optionalNumber, optionalString } from '../utils/json.js';

export function userConfigPath(): string {
  return path.join(homedir(), USER_CONFIG_DIR, USER_CONFIG_FILE);
}

export function projectConfigPath(cwd: string): string {
  return path.join(cwd, PROJECT_CONFIG_FILE);
}

export function tokenPlanBaseUrl(region: string): string {
  if (!TOKEN_PLAN_REGIONS.includes(region as (typeof TOKEN_PLAN_REGIONS)[number])) {
    throw new MiMoCliError(`Unsupported Token Plan region: ${region}`);
  }
  return `https://token-plan-${region}.xiaomimimo.com`;
}

export async function readPersistedConfig(filePath: string): Promise<PersistedConfig> {
  try {
    const content = await readFile(filePath, 'utf8');
    return parsePersistedConfig(JSON.parse(content) as unknown, filePath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export async function writeUserConfig(config: PersistedConfig): Promise<string> {
  const filePath = userConfigPath();
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return filePath;
}

export async function loadConfig(cwd: string, overrides: PersistedConfig = {}): Promise<RuntimeConfig> {
  const userConfig = await readPersistedConfig(userConfigPath());
  const projectConfig = await readPersistedConfig(projectConfigPath(cwd));
  const envConfig = envToConfig();
  const merged: PersistedConfig = {
    ...userConfig,
    ...projectConfig,
    ...envConfig,
    ...overrides,
  };

  const apiKey = merged.apiKey ?? await promptApiKeyOnce();
  if (!apiKey) {
    throw new MiMoCliError(
      'Missing API key. Run `mimo-code settings` or set MIMO_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY.',
    );
  }

  const model = merged.model ?? DEFAULT_MODEL;
  const maxTokens = clampMaxTokens(model, merged.maxTokens ?? DEFAULT_MAX_TOKENS);

  return {
    apiKey,
    baseUrl: stripTrailingSlash(merged.baseUrl ?? DEFAULT_BASE_URL),
    model,
    format: normalizeFormat(merged.format ?? 'openai'),
    maxTokens,
    temperature: merged.temperature ?? DEFAULT_TEMPERATURE,
    ...(merged.systemPrompt ? { systemPrompt: merged.systemPrompt } : {}),
    ...(merged.mcpServers ? { mcpServers: merged.mcpServers } : {}),
    ...(merged.skills ? { skills: merged.skills } : {}),
    ...(merged.hooks ? { hooks: merged.hooks } : {}),
  };
}

async function promptApiKeyOnce(): Promise<string | undefined> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  const { password } = await import('@inquirer/prompts');
  const value = await password({
    message: 'MiMo API key for this session',
    mask: '*',
    validate: (input) => (input.trim().length > 0 ? true : 'API key is required'),
  });
  return value.trim();
}

export function envToConfig(env: NodeJS.ProcessEnv = process.env): PersistedConfig {
  const config: PersistedConfig = {};
  const apiKey = env.MIMO_API_KEY ?? env.OPENAI_API_KEY ?? env.ANTHROPIC_API_KEY;
  if (apiKey) config.apiKey = apiKey;
  const baseUrl = env.MIMO_BASE_URL ?? env.OPENAI_BASE_URL ?? env.ANTHROPIC_BASE_URL;
  if (baseUrl) config.baseUrl = baseUrl;
  const model = env.MIMO_MODEL;
  if (model) config.model = model;
  const format = env.MIMO_API_FORMAT;
  if (format) config.format = normalizeFormat(format);
  const maxTokens = env.MIMO_MAX_TOKENS;
  if (maxTokens) config.maxTokens = Number.parseInt(maxTokens, 10);
  const temperature = env.MIMO_TEMPERATURE;
  if (temperature) config.temperature = Number.parseFloat(temperature);
  return config;
}

export function parsePersistedConfig(value: unknown, source: string): PersistedConfig {
  if (!isRecord(value)) {
    throw new MiMoCliError(`Invalid config at ${source}: expected JSON object`);
  }
  const config: PersistedConfig = {};
  const apiKey = optionalString(value.apiKey, 'apiKey');
  if (apiKey) config.apiKey = apiKey;
  const baseUrl = optionalString(value.baseUrl, 'baseUrl');
  if (baseUrl) config.baseUrl = baseUrl;
  const model = optionalString(value.model, 'model');
  if (model) config.model = model;
  const format = optionalString(value.format, 'format');
  if (format) config.format = normalizeFormat(format);
  const maxTokens = optionalNumber(value.maxTokens, 'maxTokens');
  if (maxTokens !== undefined) config.maxTokens = maxTokens;
  const temperature = optionalNumber(value.temperature, 'temperature');
  if (temperature !== undefined) config.temperature = temperature;
  const systemPrompt = optionalString(value.systemPrompt, 'systemPrompt');
  if (systemPrompt) config.systemPrompt = systemPrompt;
  const mcpServers = parseMcpServers(value.mcpServers);
  if (mcpServers) config.mcpServers = mcpServers;
  const skills = parseSkills(value.skills);
  if (skills) config.skills = skills;
  const hooks = parseHooks(value.hooks);
  if (hooks) config.hooks = hooks;
  return config;
}

export function maxOutputTokensForModel(model: string): number {
  if (SUPPORTED_MODELS.includes(model as (typeof SUPPORTED_MODELS)[number])) {
    return MODEL_MAX_OUTPUT_TOKENS[model as keyof typeof MODEL_MAX_OUTPUT_TOKENS];
  }
  return 131_072;
}

export function clampMaxTokens(model: string, maxTokens: number): number {
  return Math.min(Math.max(1, Math.floor(maxTokens)), maxOutputTokensForModel(model));
}

function normalizeFormat(format: string): ApiFormat {
  if (format === 'openai' || format === 'anthropic') {
    return format;
  }
  throw new MiMoCliError(`Unsupported API format: ${format}`);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseMcpServers(value: unknown): PersistedConfig['mcpServers'] {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new MiMoCliError('Field "mcpServers" must be an array');
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new MiMoCliError(`mcpServers[${index}] must be an object`);
    const name = optionalString(entry.name, 'name');
    const command = optionalString(entry.command, 'command');
    if (!name || !command) throw new MiMoCliError(`mcpServers[${index}] requires name and command`);
    const args = parseStringArray(entry.args, `mcpServers[${index}].args`);
    const env = parseStringRecord(entry.env, `mcpServers[${index}].env`);
    return {
      name,
      command,
      ...(args ? { args } : {}),
      ...(env ? { env } : {}),
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    };
  });
}

function parseSkills(value: unknown): PersistedConfig['skills'] {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new MiMoCliError('Field "skills" must be an array');
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new MiMoCliError(`skills[${index}] must be an object`);
    const name = optionalString(entry.name, 'name');
    if (!name) throw new MiMoCliError(`skills[${index}] requires name`);
    const skillPath = optionalString(entry.path, 'path');
    const description = optionalString(entry.description, 'description');
    return {
      name,
      ...(skillPath ? { path: skillPath } : {}),
      ...(description ? { description } : {}),
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    };
  });
}

function parseHooks(value: unknown): PersistedConfig['hooks'] {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new MiMoCliError('Field "hooks" must be an array');
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new MiMoCliError(`hooks[${index}] must be an object`);
    const name = optionalString(entry.name, 'name');
    const event = optionalString(entry.event, 'event');
    const command = optionalString(entry.command, 'command');
    if (!name || !event || !command) throw new MiMoCliError(`hooks[${index}] requires name, event, and command`);
    if (!isHookEvent(event)) {
      throw new MiMoCliError(`hooks[${index}] has unsupported event: ${event}`);
    }
    const args = parseStringArray(entry.args, `hooks[${index}].args`);
    const env = parseStringRecord(entry.env, `hooks[${index}].env`);
    const matcher = optionalString(entry.matcher, `hooks[${index}].matcher`);
    const allowTools = parseStringArray(entry.allowTools, `hooks[${index}].allowTools`);
    const blockTools = parseStringArray(entry.blockTools, `hooks[${index}].blockTools`);
    const timeoutMs = typeof entry.timeoutMs === 'number' ? entry.timeoutMs : undefined;
    return {
      name,
      event,
      command,
      ...(args ? { args } : {}),
      ...(env ? { env } : {}),
      ...(matcher ? { matcher } : {}),
      ...(allowTools ? { allowTools } : {}),
      ...(blockTools ? { blockTools } : {}),
      ...(timeoutMs !== undefined ? { timeoutMs } : {}),
      ...(typeof entry.continueOnCancel === 'boolean' ? { continueOnCancel: entry.continueOnCancel } : {}),
      ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}),
    };
  });
}

function isHookEvent(value: string): value is HookEvent {
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

function parseStringArray(value: unknown, key: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new MiMoCliError(`Field "${key}" must be a string array`);
  }
  return value;
}

function parseStringRecord(value: unknown, key: string): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new MiMoCliError(`Field "${key}" must be an object`);
  const output: Record<string, string> = {};
  for (const [recordKey, recordValue] of Object.entries(value)) {
    if (typeof recordValue !== 'string') throw new MiMoCliError(`Field "${key}.${recordKey}" must be a string`);
    output[recordKey] = recordValue;
  }
  return output;
}
