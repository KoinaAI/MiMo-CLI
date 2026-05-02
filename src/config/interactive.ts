import { confirm, input, select } from '@inquirer/prompts';
import { DEFAULT_BASE_URL, DEFAULT_MAX_TOKENS, DEFAULT_MODEL, DEFAULT_TEMPERATURE, SUPPORTED_MODELS } from '../constants.js';
import type { ApiFormat, PersistedConfig } from '../types.js';
import { readPersistedConfig, tokenPlanBaseUrl, userConfigPath, writeUserConfig } from './config.js';

export async function configureInteractively(): Promise<string> {
  const existing = await readPersistedConfig(userConfigPath());
  const plan = await select({
    message: 'Billing/base URL type',
    choices: [
      { name: 'Pay-as-you-go API (https://api.xiaomimimo.com)', value: 'api' },
      { name: 'Token Plan (https://token-plan-<region>.xiaomimimo.com)', value: 'token-plan' },
      { name: 'Custom base URL', value: 'custom' },
    ],
    default: 'api',
  });

  let baseUrl = DEFAULT_BASE_URL;
  if (plan === 'token-plan') {
    const region = await select({
      message: 'Token Plan region',
      choices: [
        { name: 'China (cn)', value: 'cn' },
        { name: 'Singapore (sgp)', value: 'sgp' },
        { name: 'Europe / Amsterdam (ams)', value: 'ams' },
      ],
    });
    baseUrl = tokenPlanBaseUrl(region);
  } else if (plan === 'custom') {
    baseUrl = await input({
      message: 'Custom base URL',
      default: existing.baseUrl ?? DEFAULT_BASE_URL,
      validate: (value) => (URL.canParse(value) ? true : 'Enter a valid URL'),
    });
  }

  const format = await select<ApiFormat>({
    message: 'API format',
    choices: [
      { name: 'OpenAI compatible (/v1)', value: 'openai' },
      { name: 'Anthropic compatible (/anthropic)', value: 'anthropic' },
    ],
    default: existing.format ?? 'openai',
  });
  const model = await select({
    message: 'Default model',
    choices: SUPPORTED_MODELS.map((name) => ({ name, value: name })),
    default: existing.model ?? DEFAULT_MODEL,
  });
  const maxTokensText = await input({
    message: 'Max output tokens',
    default: String(existing.maxTokens ?? DEFAULT_MAX_TOKENS),
    validate: validateInteger,
  });
  const temperatureText = await input({
    message: 'Temperature',
    default: String(existing.temperature ?? DEFAULT_TEMPERATURE),
    validate: validateNumber,
  });
  const includeSystemPrompt = await confirm({ message: 'Set a custom system prompt?', default: Boolean(existing.systemPrompt) });
  const systemPrompt = includeSystemPrompt
    ? await input({ message: 'System prompt', default: existing.systemPrompt ?? '' })
    : undefined;

  const config: PersistedConfig = {
    baseUrl,
    format,
    model,
    maxTokens: Number.parseInt(maxTokensText, 10),
    temperature: Number.parseFloat(temperatureText),
    ...(systemPrompt ? { systemPrompt } : {}),
  };
  return writeUserConfig(config);
}

function validateInteger(value: string): true | string {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? true : 'Enter a positive integer';
}

function validateNumber(value: string): true | string {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? true : 'Enter a non-negative number';
}
