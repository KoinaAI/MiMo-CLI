import {
  CONTEXT_LIMIT_PAYGO,
  CONTEXT_LIMIT_TOKEN_PLAN,
  DEFAULT_BASE_URL,
  MODEL_1M_CONTEXT_MODELS,
  SUPPORTED_MODELS,
  TOKEN_PLAN_UNSUPPORTED_MODELS,
} from '../constants.js';
import type { BillingMode, CostEstimate, TokenUsage } from '../types.js';
import type { SupportedModel } from '../constants.js';

export function mergeUsage(left: TokenUsage, right?: TokenUsage): TokenUsage {
  if (!right) return left;
  const usage: TokenUsage = {};
  assignSum(usage, 'inputTokens', left.inputTokens, right.inputTokens);
  assignSum(usage, 'outputTokens', left.outputTokens, right.outputTokens);
  assignSum(usage, 'cacheReadInputTokens', left.cacheReadInputTokens, right.cacheReadInputTokens);
  assignSum(usage, 'cacheCreationInputTokens', left.cacheCreationInputTokens, right.cacheCreationInputTokens);
  return usage;
}

export function formatUsage(usage: TokenUsage): string {
  const parts: string[] = [];
  if (usage.inputTokens !== undefined) parts.push(`input ${usage.inputTokens}`);
  if (usage.outputTokens !== undefined) parts.push(`output ${usage.outputTokens}`);
  if (usage.cacheReadInputTokens !== undefined) parts.push(`cache hit ${usage.cacheReadInputTokens}`);
  if (usage.cacheCreationInputTokens !== undefined) parts.push(`cache write ${usage.cacheCreationInputTokens}`);
  return parts.length > 0 ? parts.join(', ') : 'usage unavailable';
}

type Market = 'domestic' | 'international';
type ContextTier = 'standard' | 'long';

interface PaygoRate {
  cacheHitInputPer1k: number;
  cacheMissInputPer1k: number;
  outputPer1k: number;
}

type PaygoPricing = Record<Market, Record<SupportedModel, Partial<Record<ContextTier, PaygoRate>>>>;

const PAYGO_PRICING: PaygoPricing = {
  domestic: {
    'mimo-v2.5-pro': {
      standard: { cacheHitInputPer1k: 1.40, cacheMissInputPer1k: 7.00, outputPer1k: 21.00 },
      long: { cacheHitInputPer1k: 2.80, cacheMissInputPer1k: 14.00, outputPer1k: 42.00 },
    },
    'mimo-v2.5': {
      standard: { cacheHitInputPer1k: 0.56, cacheMissInputPer1k: 2.80, outputPer1k: 14.00 },
      long: { cacheHitInputPer1k: 1.12, cacheMissInputPer1k: 5.60, outputPer1k: 28.00 },
    },
    'mimo-v2-pro': {
      standard: { cacheHitInputPer1k: 1.40, cacheMissInputPer1k: 7.00, outputPer1k: 21.00 },
      long: { cacheHitInputPer1k: 2.80, cacheMissInputPer1k: 14.00, outputPer1k: 42.00 },
    },
    'mimo-v2-omni': {
      standard: { cacheHitInputPer1k: 0.56, cacheMissInputPer1k: 2.80, outputPer1k: 14.00 },
    },
    'mimo-v2-flash': {
      standard: { cacheHitInputPer1k: 0.07, cacheMissInputPer1k: 0.70, outputPer1k: 2.10 },
    },
  },
  international: {
    'mimo-v2.5-pro': {
      standard: { cacheHitInputPer1k: 0.20, cacheMissInputPer1k: 1.00, outputPer1k: 3.00 },
      long: { cacheHitInputPer1k: 0.40, cacheMissInputPer1k: 2.00, outputPer1k: 6.00 },
    },
    'mimo-v2.5': {
      standard: { cacheHitInputPer1k: 0.08, cacheMissInputPer1k: 0.40, outputPer1k: 2.00 },
      long: { cacheHitInputPer1k: 0.16, cacheMissInputPer1k: 0.80, outputPer1k: 4.00 },
    },
    'mimo-v2-pro': {
      standard: { cacheHitInputPer1k: 0.20, cacheMissInputPer1k: 1.00, outputPer1k: 3.00 },
      long: { cacheHitInputPer1k: 0.40, cacheMissInputPer1k: 2.00, outputPer1k: 6.00 },
    },
    'mimo-v2-omni': {
      standard: { cacheHitInputPer1k: 0.08, cacheMissInputPer1k: 0.40, outputPer1k: 2.00 },
    },
    'mimo-v2-flash': {
      standard: { cacheHitInputPer1k: 0.01, cacheMissInputPer1k: 0.10, outputPer1k: 0.30 },
    },
  },
};

const TOKEN_PLAN_MULTIPLIER: Record<SupportedModel, number> = {
  'mimo-v2.5-pro': 2,
  'mimo-v2.5': 1,
  'mimo-v2-pro': 2,
  'mimo-v2-omni': 1,
  'mimo-v2-flash': 0,
};

export function estimateCost(
  model: string,
  usage: TokenUsage,
  billingMode: BillingMode = 'paygo',
  baseUrl: string = DEFAULT_BASE_URL,
  contextLimit: number = CONTEXT_LIMIT_PAYGO,
  now: Date = new Date(),
): CostEstimate | undefined {
  if (!isSupportedModel(model)) return undefined;
  if (billingMode === 'token_plan') return calculateTokenPlanConsumption(model, usage, now);
  return calculatePaygoCost(model, usage, detectPaygoMarket(baseUrl), contextLimit);
}

export function calculatePaygoCost(
  model: SupportedModel,
  usage: TokenUsage,
  market: Market = 'international',
  contextLimit: number = CONTEXT_LIMIT_PAYGO,
): CostEstimate | undefined {
  const tier = contextLimit > CONTEXT_LIMIT_PAYGO ? 'long' : 'standard';
  const pricing = PAYGO_PRICING[market][model][tier] ?? PAYGO_PRICING[market][model].standard;
  if (!pricing) return undefined;
  const cacheReadTokens = usage.cacheReadInputTokens ?? 0;
  const cacheCreationTokens = usage.cacheCreationInputTokens ?? 0;
  const inputTokens = Math.max(0, (usage.inputTokens ?? 0) - cacheReadTokens - cacheCreationTokens);
  const outputTokens = usage.outputTokens ?? 0;
  const cacheHitCost = (cacheReadTokens / 1000) * pricing.cacheHitInputPer1k;
  const inputCost = (inputTokens / 1000) * pricing.cacheMissInputPer1k + cacheHitCost;
  const outputCost = (outputTokens / 1000) * pricing.outputPer1k;
  const currency = market === 'domestic' ? 'CNY' : 'USD';
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    currency,
    detail: `${market} paygo · ${tier === 'long' ? '256K–1M' : '≤256K'} tier · cache writes free`,
  };
}

export function calculateTokenPlanConsumption(model: SupportedModel, usage: TokenUsage, now: Date = new Date()): CostEstimate | undefined {
  if (TOKEN_PLAN_UNSUPPORTED_MODELS.includes(model)) return undefined;
  const multiplier = TOKEN_PLAN_MULTIPLIER[model];
  const discount = isNightDiscountWindow(now) ? 0.8 : 1;
  const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  const creditsConsumed = tokens * multiplier * discount;
  return {
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
    currency: 'CREDITS',
    creditsConsumed,
    detail: `Token Plan · ${multiplier}x model multiplier · ${discount}x time coefficient`,
  };
}

export function formatCost(cost: CostEstimate | undefined): string {
  if (!cost) return '';
  if (cost.currency === 'CREDITS') return `${Math.ceil(cost.creditsConsumed ?? 0).toLocaleString()} credits`;
  if (cost.currency === 'CNY') return `¥${cost.totalCost.toFixed(4)}`;
  return `$${cost.totalCost.toFixed(4)}`;
}

export function detectBillingMode(baseUrl: string): BillingMode {
  return /token-plan-/u.test(baseUrl) ? 'token_plan' : 'paygo';
}

export function detectPaygoMarket(baseUrl: string): Market {
  return baseUrl.includes('api.xiaomimimo.com') ? 'domestic' : 'international';
}

export function calculateContextDefault(billingMode: BillingMode, model: string): number {
  const desired = billingMode === 'token_plan' ? CONTEXT_LIMIT_TOKEN_PLAN : CONTEXT_LIMIT_PAYGO;
  return modelSupportsContext(model, desired) ? desired : CONTEXT_LIMIT_PAYGO;
}

export function modelSupportsContext(model: string, contextLimit: number): boolean {
  if (contextLimit <= CONTEXT_LIMIT_PAYGO) return true;
  return isSupportedModel(model) && MODEL_1M_CONTEXT_MODELS.includes(model);
}

export function isTokenPlanSupported(model: string): boolean {
  return isSupportedModel(model) && !TOKEN_PLAN_UNSUPPORTED_MODELS.includes(model);
}

export function isNightDiscountWindow(now: Date): boolean {
  const hour = now.getUTCHours();
  return hour >= 16 && hour < 24;
}

export function formatContextUsage(inputTokens: number, maxContext: number): string {
  const percent = Math.round((inputTokens / maxContext) * 100);
  const bar = progressBar(percent, 20);
  return `${bar} ${percent}% context`;
}

function progressBar(percent: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const filled = Math.max(0, Math.min(width, Math.round((clamped / 100) * width)));
  const empty = Math.max(0, width - filled);
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
}

function isSupportedModel(model: string): model is SupportedModel {
  return SUPPORTED_MODELS.includes(model as SupportedModel);
}

function assignSum(keyedUsage: TokenUsage, key: keyof TokenUsage, left?: number, right?: number): void {
  if (left !== undefined || right !== undefined) {
    keyedUsage[key] = (left ?? 0) + (right ?? 0);
  }
}
