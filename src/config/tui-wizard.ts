import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_TEMPERATURE, SUPPORTED_MODELS } from '../constants.js';
import type { HookEvent, McpServerConfig, PersistedConfig, SkillConfig } from '../types.js';
import { readPersistedConfig, tokenPlanBaseUrl, userConfigPath, writeUserConfig } from './config.js';

export type ConfigWizardStep =
  | 'apiKey'
  | 'baseUrlType'
  | 'tokenRegion'
  | 'customBaseUrl'
  | 'format'
  | 'model'
  | 'maxTokens'
  | 'temperature'
  | 'systemPrompt'
  | 'mcpServers'
  | 'skills'
  | 'hooks'
  | 'review';

export interface ConfigWizardState {
  step: ConfigWizardStep;
  draft: PersistedConfig;
  existing: PersistedConfig;
  error?: string | undefined;
}

export async function createConfigWizardState(): Promise<ConfigWizardState> {
  const existing = await readPersistedConfig(userConfigPath());
  const draft: PersistedConfig = {
    baseUrl: existing.baseUrl ?? DEFAULT_BASE_URL,
    format: existing.format ?? 'openai',
    model: existing.model ?? DEFAULT_MODEL,
    temperature: existing.temperature ?? DEFAULT_TEMPERATURE,
  };
  if (existing.maxTokens !== undefined) draft.maxTokens = existing.maxTokens;
  if (existing.systemPrompt) draft.systemPrompt = existing.systemPrompt;
  if (existing.mcpServers) draft.mcpServers = existing.mcpServers;
  if (existing.skills) draft.skills = existing.skills;
  if (existing.hooks) draft.hooks = existing.hooks;
  return {
    step: 'apiKey',
    existing,
    draft,
  };
}

export function wizardPrompt(state: ConfigWizardState): string {
  switch (state.step) {
    case 'apiKey':
      return 'API key for this launch（输入 . 跳过，不写入配置文件）';
    case 'baseUrlType':
      return 'Provider：api / token / custom';
    case 'tokenRegion':
      return 'Token Plan region：cn / sgp / ams';
    case 'customBaseUrl':
      return 'Custom base URL';
    case 'format':
      return 'Wire format：openai / anthropic';
    case 'model':
      return `Model：${SUPPORTED_MODELS.join(' / ')}`;
    case 'maxTokens':
      return 'Max output tokens（留空自动）';
    case 'temperature':
      return 'Temperature';
    case 'systemPrompt':
      return 'Instructions（留空跳过）';
    case 'mcpServers':
      return 'MCP servers JSON array（留空跳过）';
    case 'skills':
      return 'Skills JSON array（留空跳过）';
    case 'hooks':
      return 'Hooks JSON array（留空跳过）';
    case 'review':
      return '输入 save 保存 settings，back 返回，cancel 取消';
  }
}

export function wizardSummary(state: ConfigWizardState): string {
  const lines = [
    `Provider URL: ${state.draft.baseUrl ?? '(default)'}`,
    `Format: ${state.draft.format ?? 'openai'}`,
    `Model: ${state.draft.model ?? DEFAULT_MODEL}`,
    `Max tokens: ${state.draft.maxTokens ?? 'auto'}`,
    `Temperature: ${state.draft.temperature ?? DEFAULT_TEMPERATURE}`,
    `Instructions: ${state.draft.systemPrompt ? 'custom' : 'default'}`,
    `MCP servers: ${state.draft.mcpServers?.length ?? 0}`,
    `Skills: ${state.draft.skills?.length ?? 0}`,
    `Hooks: ${state.draft.hooks?.length ?? 0}`,
    'API key: runtime only, not saved',
  ];
  return lines.join('\n');
}

export function updateWizard(state: ConfigWizardState, rawInput: string): ConfigWizardState {
  const input = rawInput.trim();
  if (input === 'cancel') return { ...state, step: 'review', error: 'Cancelled. Type /settings to restart.' };
  if (input === 'back') return { ...state, step: previousStep(state.step), error: undefined };

  try {
    if (state.step === 'apiKey') {
      return next(state, 'baseUrlType', {});
    }
    if (state.step === 'baseUrlType') {
      if (input === 'api' || input === '') return next(state, 'format', { baseUrl: DEFAULT_BASE_URL });
      if (input === 'token') return next(state, 'tokenRegion', {});
      if (input === 'custom') return next(state, 'customBaseUrl', {});
      return withError(state, '请输入 api / token / custom');
    }
    if (state.step === 'tokenRegion') {
      return next(state, 'format', { baseUrl: tokenPlanBaseUrl(input) });
    }
    if (state.step === 'customBaseUrl') {
      if (!URL.canParse(input)) return withError(state, '请输入合法 URL');
      return next(state, 'format', { baseUrl: input });
    }
    if (state.step === 'format') {
      if (input !== 'openai' && input !== 'anthropic') return withError(state, '请输入 openai 或 anthropic');
      return next(state, 'model', { format: input });
    }
    if (state.step === 'model') {
      if (!SUPPORTED_MODELS.includes(input as (typeof SUPPORTED_MODELS)[number])) return withError(state, '不支持的模型');
      return next(state, 'maxTokens', { model: input });
    }
    if (state.step === 'maxTokens') {
      const maxTokens = input ? Number.parseInt(input, 10) : undefined;
      if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens <= 0)) return withError(state, '请输入正整数');
      return next(state, 'temperature', maxTokens ? { maxTokens } : {});
    }
    if (state.step === 'temperature') {
      const temperature = input ? Number.parseFloat(input) : DEFAULT_TEMPERATURE;
      if (!Number.isFinite(temperature) || temperature < 0) return withError(state, '请输入非负数字');
      return next(state, 'systemPrompt', { temperature });
    }
    if (state.step === 'systemPrompt') {
      return next(state, 'mcpServers', input ? { systemPrompt: input } : {});
    }
    if (state.step === 'mcpServers') {
      return next(state, 'skills', input ? { mcpServers: parseMcpServersInput(input) } : {});
    }
    if (state.step === 'skills') {
      return next(state, 'hooks', input ? { skills: parseSkillsInput(input) } : {});
    }
    if (state.step === 'hooks') {
      if (!input) return next(state, 'review', {});
      const hooks = parseHooksInput(input);
      return next(state, 'review', hooks ? { hooks } : {});
    }
    return state;
  } catch (error) {
    return withError(state, error instanceof Error ? error.message : String(error));
  }
}

export async function saveWizardConfig(state: ConfigWizardState): Promise<string> {
  const draftWithoutKey = omitApiKey(state.draft);
  const existingWithoutKey = omitApiKey(state.existing);
  const config = { ...existingWithoutKey, ...draftWithoutKey };
  return writeUserConfig(config);
}

function omitApiKey(config: PersistedConfig): PersistedConfig {
  const copy = { ...config };
  delete copy.apiKey;
  return copy;
}

function next(state: ConfigWizardState, step: ConfigWizardStep, patch: PersistedConfig): ConfigWizardState {
  return { ...state, step, draft: { ...state.draft, ...patch }, error: undefined };
}

function withError(state: ConfigWizardState, error: string): ConfigWizardState {
  return { ...state, error };
}

function previousStep(step: ConfigWizardStep): ConfigWizardStep {
  const steps: ConfigWizardStep[] = [
    'apiKey',
    'baseUrlType',
    'tokenRegion',
    'customBaseUrl',
    'format',
    'model',
    'maxTokens',
    'temperature',
    'systemPrompt',
    'mcpServers',
    'skills',
    'hooks',
    'review',
  ];
  const index = steps.indexOf(step);
  return steps[Math.max(0, index - 1)] ?? 'apiKey';
}

function parseMcpServersInput(input: string): McpServerConfig[] {
  const value = JSON.parse(input) as unknown;
  if (!Array.isArray(value)) throw new Error('MCP 配置必须是数组');
  return value as McpServerConfig[];
}

function parseSkillsInput(input: string): SkillConfig[] {
  const value = JSON.parse(input) as unknown;
  if (!Array.isArray(value)) throw new Error('Skill 配置必须是数组');
  return value as SkillConfig[];
}

function parseHooksInput(input: string): PersistedConfig['hooks'] {
  const value = JSON.parse(input) as unknown;
  if (!Array.isArray(value)) throw new Error('Hook 配置必须是数组');
  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error('Hook entry must be object');
    const record = entry as {
      name?: unknown;
      event?: unknown;
      command?: unknown;
      args?: unknown;
      env?: unknown;
      enabled?: unknown;
      matcher?: unknown;
      allowTools?: unknown;
      blockTools?: unknown;
      timeoutMs?: unknown;
      continueOnCancel?: unknown;
    };
    if (typeof record.name !== 'string' || typeof record.event !== 'string' || typeof record.command !== 'string') {
      throw new Error('Hook requires name, event and command');
    }
    return {
      name: record.name,
      event: record.event as HookEvent,
      command: record.command,
      ...(Array.isArray(record.args) && record.args.every((arg) => typeof arg === 'string') ? { args: record.args } : {}),
      ...(typeof record.env === 'object' && record.env !== null && !Array.isArray(record.env) ? { env: record.env as Record<string, string> } : {}),
      ...(typeof record.enabled === 'boolean' ? { enabled: record.enabled } : {}),
      ...(typeof record.matcher === 'string' ? { matcher: record.matcher } : {}),
      ...(Array.isArray(record.allowTools) && record.allowTools.every((tool) => typeof tool === 'string') ? { allowTools: record.allowTools } : {}),
      ...(Array.isArray(record.blockTools) && record.blockTools.every((tool) => typeof tool === 'string') ? { blockTools: record.blockTools } : {}),
      ...(typeof record.timeoutMs === 'number' ? { timeoutMs: record.timeoutMs } : {}),
      ...(typeof record.continueOnCancel === 'boolean' ? { continueOnCancel: record.continueOnCancel } : {}),
    };
  });
}
