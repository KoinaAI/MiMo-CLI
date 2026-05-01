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
export const MULTIMODAL_MODELS = ['mimo-v2-omni', 'mimo-v2.5'] as const;
export const MODEL_MAX_OUTPUT_TOKENS: Record<SupportedModel, number> = {
  'mimo-v2.5-pro': 131_072,
  'mimo-v2.5': 131_072,
  'mimo-v2-pro': 131_072,
  'mimo-v2-omni': 131_072,
  'mimo-v2-flash': 65_536,
};
export const USER_CONFIG_DIR = '.mimo-code';
export const USER_CONFIG_FILE = 'config.json';
export const SESSIONS_DIR = 'sessions';
export const PROJECT_CONFIG_FILE = '.mimo-code.json';
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 0;
