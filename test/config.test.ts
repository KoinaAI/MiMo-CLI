import { describe, expect, it } from 'vitest';
import { envToConfig, parsePersistedConfig, tokenPlanBaseUrl } from '../src/config/config.js';

it('builds token plan base URLs', () => {
  expect(tokenPlanBaseUrl('cn')).toBe('https://token-plan-cn.xiaomimimo.com');
  expect(tokenPlanBaseUrl('sgp')).toBe('https://token-plan-sgp.xiaomimimo.com');
  expect(tokenPlanBaseUrl('ams')).toBe('https://token-plan-ams.xiaomimimo.com');
});

describe('envToConfig', () => {
  it('reads MiMo environment variables first', () => {
    expect(
      envToConfig({
        MIMO_API_KEY: 'mimo-key',
        OPENAI_API_KEY: 'openai-key',
        MIMO_BASE_URL: 'https://example.test',
        MIMO_MODEL: 'mimo-v2.5',
        MIMO_MAX_TOKENS: '123',
        MIMO_TEMPERATURE: '0.2',
      }),
    ).toEqual({
      apiKey: 'mimo-key',
      baseUrl: 'https://example.test',
      model: 'mimo-v2.5',
      maxTokens: 123,
      temperature: 0.2,
    });
  });
});

describe('parsePersistedConfig', () => {
  it('accepts valid persisted config', () => {
    expect(
      parsePersistedConfig(
        {
          apiKey: 'key',
          baseUrl: 'https://api.xiaomimimo.com',
          model: 'mimo-v2.5-pro',
          maxTokens: 4096,
          temperature: 0,
          systemPrompt: 'custom',
        },
        'test',
      ),
    ).toEqual({
      apiKey: 'key',
      baseUrl: 'https://api.xiaomimimo.com',
      model: 'mimo-v2.5-pro',
      maxTokens: 4096,
      temperature: 0,
      systemPrompt: 'custom',
    });
  });

  it('ignores legacy format settings', () => {
    expect(parsePersistedConfig({ format: 'bad' }, 'test')).toEqual({});
  });

  it('parses expanded hook workflow fields', () => {
    const parsed = parsePersistedConfig(
      {
        hooks: [
          {
            name: 'guard',
            event: 'pre_tool_use',
            command: 'node',
            args: ['guard.js'],
            matcher: 'run_*',
            allowTools: ['run_shell'],
            blockTools: ['git_commit'],
            timeoutMs: 1000,
            continueOnCancel: true,
          },
        ],
      },
      'test',
    );
    expect(parsed.hooks?.[0]).toMatchObject({
      name: 'guard',
      event: 'pre_tool_use',
      matcher: 'run_*',
      allowTools: ['run_shell'],
      blockTools: ['git_commit'],
      timeoutMs: 1000,
      continueOnCancel: true,
    });
  });
});
