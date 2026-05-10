import React, { useCallback, useState } from 'react';
import { Box, render, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import chalk from 'chalk';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TEMPERATURE,
  MODEL_DESCRIPTIONS,
  MODEL_TIERS,
  TOKEN_PLAN_REGIONS,
} from '../constants.js';
import { envToConfig, projectConfigPath, readPersistedConfig, tokenPlanBaseUrl, userConfigPath, writeUserConfig } from '../config/config.js';
import type { PersistedConfig } from '../types.js';
import { MimoTextInput } from './text-input.js';

type OnboardingStep =
  | 'welcome'
  | 'apiType'
  | 'tokenRegion'
  | 'customUrl'
  | 'apiKey'
  | 'model'
  | 'review';

interface OnboardingResult {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return '****';
  return `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
}

const LOGO_LINES = [
  '  ███╗   ███╗ ██╗ ███╗   ███╗  ██████╗ ',
  '  ████╗ ████║ ██║ ████╗ ████║ ██╔═══██╗',
  '  ██╔████╔██║ ██║ ██╔████╔██║ ██║   ██║',
  '  ██║╚██╔╝██║ ██║ ██║╚██╔╝██║ ██║   ██║',
  '  ██║ ╚═╝ ██║ ██║ ██║ ╚═╝ ██║ ╚██████╔╝',
  '  ╚═╝     ╚═╝ ╚═╝ ╚═╝     ╚═╝  ╚═════╝ ',
];

const REGION_ITEMS = TOKEN_PLAN_REGIONS.map((region) => {
  const labels: Record<string, string> = { cn: 'China (cn)', sgp: 'Singapore (sgp)', ams: 'Europe / Amsterdam (ams)' };
  return { label: labels[region] ?? region, value: region };
});

const MODEL_ITEMS = MODEL_TIERS.flatMap(({ tier, models }) =>
  models.map((model) => ({ label: `[${tier}] ${model.padEnd(16)} ${chalk.dim(MODEL_DESCRIPTIONS[model])}`, value: model })),
);

interface OnboardingAppProps {
  onComplete(result: OnboardingResult): void;
  existing: PersistedConfig;
  existingApiKey?: string | undefined;
}

function OnboardingApp({ onComplete, existing, existingApiKey }: OnboardingAppProps): React.ReactElement {
  const { exit } = useApp();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [apiType, setApiType] = useState<'api' | 'token' | 'custom'>('api');
  const [baseUrl, setBaseUrl] = useState(existing.baseUrl ?? DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState(existingApiKey ?? '');
  const [model, setModel] = useState<string>(existing.model ?? DEFAULT_MODEL);
  const [error, setError] = useState('');

  const continueFromApiType = useCallback((type: 'api' | 'token' | 'custom') => {
    setApiType(type);
    setError('');
    if (type === 'api') {
      setBaseUrl(DEFAULT_BASE_URL);
      setStep('apiKey');
      return;
    }
    setStep(type === 'token' ? 'tokenRegion' : 'customUrl');
  }, []);

  const goNext = useCallback(() => {
    setError('');
    if (step === 'welcome') { setStep('apiType'); return; }
    if (step === 'apiType') {
      if (apiType === 'api') { setBaseUrl(DEFAULT_BASE_URL); setStep('apiKey'); }
      else if (apiType === 'token') { setStep('tokenRegion'); }
      else { setStep('customUrl'); }
      return;
    }
    if (step === 'tokenRegion') { setStep('apiKey'); return; }
    if (step === 'customUrl') {
      if (!URL.canParse(baseUrl)) { setError('Please enter a valid URL'); return; }
      setStep('apiKey');
      return;
    }
    if (step === 'apiKey') {
      const trimmed = apiKey.trim();
      if (!trimmed) { setError('API key is required'); return; }
      setApiKey(trimmed);
      setStep('model');
      return;
    }
    if (step === 'model') { setStep('review'); return; }
    if (step === 'review') {
      onComplete({ apiKey: apiKey.trim(), baseUrl, model });
      return;
    }
  }, [step, apiType, baseUrl, apiKey, model, onComplete]);

  const goBack = useCallback(() => {
    setError('');
    if (step === 'apiType') { setStep('welcome'); return; }
    if (step === 'tokenRegion' || step === 'customUrl') { setStep('apiType'); return; }
    if (step === 'apiKey') {
      if (apiType === 'token') setStep('tokenRegion');
      else if (apiType === 'custom') setStep('customUrl');
      else setStep('apiType');
      return;
    }
    if (step === 'model') { setStep('apiKey'); return; }
    if (step === 'review') { setStep('model'); return; }
  }, [step, apiType]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      exit();
      return;
    }
    if (step === 'welcome' && key.return) {
      goNext();
      return;
    }
    if (step === 'review') {
      if (key.return) { goNext(); return; }
      if (key.escape) { goBack(); return; }
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Logo — always visible */}
      <Box flexDirection="column" marginBottom={1}>
        {LOGO_LINES.map((line, idx) => (
          <Text key={idx} color="cyan">{line}</Text>
        ))}
      </Box>

      {step === 'welcome' && <WelcomeStep />}
      {step === 'apiType' && (
        <ApiTypeStep
          onSelect={continueFromApiType}
        />
      )}
      {step === 'tokenRegion' && (
        <TokenRegionStep
          onSelect={(region) => { setBaseUrl(tokenPlanBaseUrl(region)); setError(''); setStep('apiKey'); }}
          onBack={goBack}
        />
      )}
      {step === 'customUrl' && (
        <CustomUrlStep
          value={baseUrl}
          onChange={setBaseUrl}
          onSubmit={() => { if (!URL.canParse(baseUrl)) { setError('Please enter a valid URL'); return; } setError(''); setStep('apiKey'); }}
          onBack={goBack}
          error={error}
        />
      )}
      {step === 'apiKey' && (
        <ApiKeyStep
          value={apiKey}
          onChange={(v) => { setApiKey(v); setError(''); }}
          onSubmit={() => {
            const trimmed = apiKey.trim();
            if (!trimmed) {
              setError('API key is required');
              return;
            }
            setApiKey(trimmed);
            setError('');
            setStep('model');
          }}
          onBack={goBack}
          error={error}
          baseUrl={baseUrl}
        />
      )}
      {step === 'model' && (
        <ModelStep
          current={model}
          onSelect={(m) => { setModel(m); setStep('review'); }}
          onBack={goBack}
        />
      )}
      {step === 'review' && (
        <ReviewStep
          apiKey={apiKey}
          baseUrl={baseUrl}
          model={model}
        />
      )}

      {/* Global error */}
      {error && step !== 'customUrl' && step !== 'apiKey' ? (
        <Box marginTop={1}>
          <Text color="red">  {error}</Text>
        </Box>
      ) : null}

      {/* Navigation hints */}
      <Box marginTop={1}>
        <Text dimColor>
          {step === 'welcome'
            ? '  Press Enter to begin setup'
            : step === 'review'
              ? '  Enter save · Esc back · Ctrl+C quit'
              : '  ↑↓ select · Enter confirm · Esc back · Ctrl+C quit'}
        </Text>
      </Box>
    </Box>
  );
}

function WelcomeStep(): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>  Welcome to MiMo Code</Text>
      <Text dimColor>  Intelligent Coding Agent · v0.2.0</Text>
      <Text> </Text>
      <Text>  Before you start, let's configure your API connection.</Text>
      <Text dimColor>  MiMo Code uses the Anthropic-compatible API format.</Text>
      <Text dimColor>  You need a MiMo API Key — either pay-as-you-go or Token Plan.</Text>
    </Box>
  );
}

function ApiTypeStep({ onSelect }: { onSelect(type: 'api' | 'token' | 'custom'): void }): React.ReactElement {
  const items = [
    { label: `Pay-as-you-go API  ${chalk.dim('(https://api.xiaomimimo.com)')}`, value: 'api' as const },
    { label: `Token Plan         ${chalk.dim('(https://token-plan-<region>.xiaomimimo.com)')}`, value: 'token' as const },
    { label: `Custom Base URL    ${chalk.dim('(self-hosted or proxy)')}`, value: 'custom' as const },
  ];
  return (
    <Box flexDirection="column">
      <Text bold>  How would you like to connect?</Text>
      <Text dimColor>  Choose your billing / base URL type</Text>
      <Text> </Text>
      <Box paddingLeft={2}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}

function TokenRegionStep({ onSelect, onBack }: { onSelect(region: string): void; onBack(): void }): React.ReactElement {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });
  return (
    <Box flexDirection="column">
      <Text bold>  Select your Token Plan region</Text>
      <Text> </Text>
      <Box paddingLeft={2}>
        <SelectInput items={REGION_ITEMS} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}

function CustomUrlStep({
  value, onChange, onSubmit, onBack, error,
}: {
  value: string;
  onChange(v: string): void;
  onSubmit(): void;
  onBack(): void;
  error: string;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });
  return (
    <Box flexDirection="column">
      <Text bold>  Enter your custom base URL</Text>
      <Text> </Text>
      <Box paddingLeft={2} borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan">URL › </Text>
        <MimoTextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          mask="*"
          placeholder="https://your-api-endpoint.example.com"
        />
      </Box>
      {error ? <Text color="red">  {error}</Text> : null}
    </Box>
  );
}

function ApiKeyStep({
  value, onChange, onSubmit, onBack, error, baseUrl,
}: {
  value: string;
  onChange(v: string): void;
  onSubmit(): void;
  onBack(): void;
  error: string;
  baseUrl: string;
}): React.ReactElement {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  const masked = value.length > 0
    ? value.slice(0, 4) + '*'.repeat(Math.max(0, value.length - 8)) + (value.length > 8 ? value.slice(-4) : '')
    : '';

  return (
    <Box flexDirection="column">
      <Text bold>  Enter your MiMo API key</Text>
      <Text dimColor>  Connecting to: {baseUrl}</Text>
      <Text dimColor>  The key will be stored in ~/.mimo-code/config.json (chmod 600)</Text>
      <Text> </Text>
      <Box paddingLeft={2} borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text color="cyan">API Key › </Text>
        <MimoTextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Paste or type your MiMo API key"
        />
      </Box>
      {value.length > 0 ? (
        <Box paddingLeft={2} marginTop={0}>
          <Text dimColor>  Preview: {masked}</Text>
        </Box>
      ) : null}
      {error ? <Text color="red">  {error}</Text> : null}
    </Box>
  );
}

function ModelStep({ current, onSelect, onBack }: { current: string; onSelect(m: string): void; onBack(): void }): React.ReactElement {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  const items = MODEL_ITEMS.map((item) => ({
    ...item,
    label: `${item.value === current ? '› ' : '  '}${item.label}`,
  }));

  return (
    <Box flexDirection="column">
      <Text bold>  Choose your default model</Text>
      <Text dimColor>  You can change this anytime with /model or /settings</Text>
      <Text> </Text>
      <Box paddingLeft={2}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}

function ReviewStep({
  apiKey,
  baseUrl,
  model,
}: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color="green">  ✓ Configuration ready</Text>
      <Text> </Text>
      <Text>  Base URL:  <Text color="cyan">{baseUrl}</Text></Text>
      <Text>  API Key:   <Text color="yellow">{maskApiKey(apiKey)}</Text></Text>
      <Text>  Model:     <Text color="cyan">{model}</Text></Text>
      <Text>  Output:    <Text dimColor>Fixed by selected model</Text></Text>
      <Text>  Format:    <Text dimColor>Anthropic (/anthropic/v1/messages)</Text></Text>
      <Text> </Text>
      <Text dimColor>  Settings will be saved to ~/.mimo-code/config.json</Text>
      <Text dimColor>  API key is saved securely (file permissions 600).</Text>
    </Box>
  );
}

/**
 * Check whether we need the first-install onboarding flow.
 * Returns true when no config file and no env-provided API key exist.
 */
export async function needsOnboarding(cwd = process.cwd()): Promise<boolean> {
  const existing = await readPersistedConfig(userConfigPath());
  const project = await readPersistedConfig(projectConfigPath(cwd));
  return needsOnboardingFromConfig({ ...existing, ...project, ...envToConfig() });
}

export function needsOnboardingFromConfig(config: PersistedConfig): boolean {
  return !config.apiKey;
}

/**
 * Run the full-screen onboarding TUI. Returns the saved config on success,
 * or undefined if the user exits with Ctrl+C.
 */
export async function runOnboarding(): Promise<PersistedConfig | undefined> {
  const existing = await readPersistedConfig(userConfigPath());
  const envKey = process.env.MIMO_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY;

  return new Promise((resolve) => {
    let resolved = false;
    const instance = render(
      <OnboardingApp
        existing={existing}
        existingApiKey={envKey}
        onComplete={async (result) => {
          if (resolved) return;
          resolved = true;
          const config: PersistedConfig = {
            ...existing,
            apiKey: result.apiKey,
            baseUrl: result.baseUrl,
            model: result.model,
            temperature: DEFAULT_TEMPERATURE,
          };
          delete config.maxTokens;
          await writeUserConfig(config);
          instance.unmount();
          resolve(config);
        }}
      />,
      { exitOnCtrlC: false },
    );

    instance.waitUntilExit().then(() => {
      if (!resolved) {
        resolved = true;
        resolve(undefined);
      }
    }).catch(() => {
      if (!resolved) {
        resolved = true;
        resolve(undefined);
      }
    });
  });
}
