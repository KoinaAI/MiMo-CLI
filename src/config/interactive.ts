import { runOnboarding } from '../ui/onboarding.js';
import { userConfigPath } from './config.js';

export async function configureInteractively(): Promise<string> {
  const config = await runOnboarding();
  if (!config) throw new Error('Configuration cancelled');
  return userConfigPath();
}
