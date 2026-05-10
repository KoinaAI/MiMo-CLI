import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BASE_URL } from '../src/constants.js';
import { needsOnboarding, needsOnboardingFromConfig, maskApiKey } from '../src/ui/onboarding.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('needsOnboarding', () => {
  it('starts onboarding when no persisted or environment API key exists', async () => {
    const cwd = await isolatedHome();
    expect(await needsOnboarding(cwd)).toBe(true);
  });

  it('skips onboarding when the project config has an API key', async () => {
    const cwd = await isolatedHome();
    await writeFile(path.join(cwd, '.mimo-code.json'), JSON.stringify({ apiKey: 'project-key' }));

    expect(await needsOnboarding(cwd)).toBe(false);
  });

  it('skips onboarding when an environment API key exists', async () => {
    const cwd = await isolatedHome();
    process.env.MIMO_API_KEY = 'env-key';

    expect(await needsOnboarding(cwd)).toBe(false);
  });
});

describe('needsOnboardingFromConfig', () => {
  it('starts onboarding only when merged config lacks an API key', () => {
    expect(needsOnboardingFromConfig({ baseUrl: DEFAULT_BASE_URL })).toBe(true);
    expect(needsOnboardingFromConfig({ apiKey: 'key', baseUrl: DEFAULT_BASE_URL })).toBe(false);
  });
});

describe('maskApiKey', () => {
  it('masks API keys without exposing the full value', () => {
    expect(maskApiKey('abcd1234wxyz')).toBe('abcd****wxyz');
    expect(maskApiKey('short')).toBe('****');
  });
});

async function isolatedHome(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), 'mimo-onboarding-'));
  process.env.HOME = cwd;
  process.env.USERPROFILE = cwd;
  delete process.env.MIMO_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  return cwd;
}
