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
export const MULTIMODAL_MODELS = ['mimo-v2-omni', 'mimo-v2.5'] as const;
export const USER_CONFIG_DIR = '.mimo-code';
export const USER_CONFIG_FILE = 'config.json';
export const PROJECT_CONFIG_FILE = '.mimo-code.json';
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 0;
