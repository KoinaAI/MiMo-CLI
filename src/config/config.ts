import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  PROJECT_CONFIG_FILE,
  TOKEN_PLAN_REGIONS,
  USER_CONFIG_DIR,
  USER_CONFIG_FILE,
} from '../constants.js';
import type { ApiFormat, PersistedConfig, RuntimeConfig } from '../types.js';
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

  const apiKey = merged.apiKey;
  if (!apiKey) {
    throw new MiMoCliError(
      'Missing API key. Run `mimo-code config` or set MIMO_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY.',
    );
  }

  return {
    apiKey,
    baseUrl: stripTrailingSlash(merged.baseUrl ?? DEFAULT_BASE_URL),
    model: merged.model ?? DEFAULT_MODEL,
    format: normalizeFormat(merged.format ?? 'openai'),
    maxTokens: merged.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: merged.temperature ?? DEFAULT_TEMPERATURE,
    ...(merged.systemPrompt ? { systemPrompt: merged.systemPrompt } : {}),
  };
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
  return config;
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
