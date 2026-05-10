export const DEFAULT_BASE_URL = 'https://api.xiaomimimo.com';
export const TOKEN_PLAN_REGIONS = ['cn', 'sgp', 'ams'] as const;
export const DEFAULT_MODEL = 'mimo-v2.5-pro';
export const SUPPORTED_MODELS = [
  'mimo-v2.5-pro',
  'mimo-v2.5',
  'mimo-v2-pro',
  'mimo-v2-omni',
  'mimo-v2-flash',
] as const;
export type SupportedModel = (typeof SUPPORTED_MODELS)[number];
export const MULTIMODAL_MODELS: readonly SupportedModel[] = ['mimo-v2.5', 'mimo-v2-omni'];

/** Models that support 1M context window (256K–1M tier). */
export const MODEL_1M_CONTEXT_MODELS: readonly SupportedModel[] = ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-pro'];

export const MODEL_MAX_OUTPUT_TOKENS: Record<SupportedModel, number> = {
  'mimo-v2.5-pro': 131_072,
  'mimo-v2.5': 32_768,
  'mimo-v2-pro': 131_072,
  'mimo-v2-omni': 32_768,
  'mimo-v2-flash': 65_536,
};

/** Default context window size per billing mode. */
export const CONTEXT_LIMIT_TOKEN_PLAN = 1_000_000;
export const CONTEXT_LIMIT_PAYGO = 256_000;

/** Token Plan does NOT support mimo-v2-flash. */
export const TOKEN_PLAN_UNSUPPORTED_MODELS: readonly SupportedModel[] = ['mimo-v2-flash'];

export const USER_CONFIG_DIR = '.mimo-code';
export const USER_CONFIG_FILE = 'config.json';
export const SESSIONS_DIR = 'sessions';
export const PROJECT_CONFIG_FILE = '.mimo-code.json';
export const DEFAULT_TEMPERATURE = 0;

/** Compaction model — always use mimo-v2.5 for auto-compaction. */
export const COMPACTION_MODEL: SupportedModel = 'mimo-v2.5';

/** Trigger auto-compaction when estimated tokens exceed this fraction of context limit. */
export const COMPACTION_THRESHOLD = 0.85;

/** Model descriptions for the TUI model picker. */
export const MODEL_DESCRIPTIONS: Record<SupportedModel, string> = {
  'mimo-v2.5-pro': 'Flagship · 131K output · 1M context',
  'mimo-v2.5': 'Balanced · multimodal · 1M context',
  'mimo-v2-pro': 'Pro · 131K output · 1M context',
  'mimo-v2-omni': 'Multimodal · vision/audio · 256K context',
  'mimo-v2-flash': 'Fast & affordable · 65K output · 256K context',
};

/** Model tier groupings for TUI display. */
export const MODEL_TIERS: { tier: string; models: readonly SupportedModel[] }[] = [
  { tier: 'Pro', models: ['mimo-v2.5-pro', 'mimo-v2-pro'] },
  { tier: 'Standard', models: ['mimo-v2.5', 'mimo-v2-omni'] },
  { tier: 'Flash', models: ['mimo-v2-flash'] },
];
