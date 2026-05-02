import { access, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { RuntimeConfig } from '../types.js';

export interface DiagnosticResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

async function checkApiKey(config: RuntimeConfig): Promise<DiagnosticResult> {
  if (config.apiKey) {
    return { name: 'API Key', status: 'pass', message: 'API key is configured' };
  }
  return { name: 'API Key', status: 'fail', message: 'No API key found. Set MIMO_API_KEY or run /config.' };
}

async function checkConfigFile(): Promise<DiagnosticResult> {
  const configPath = path.join(homedir(), '.mimo-code', 'config.json');
  try {
    await access(configPath);
    return { name: 'Config File', status: 'pass', message: `Found at ${configPath}` };
  } catch {
    return { name: 'Config File', status: 'warn', message: 'No user config file. Using defaults.' };
  }
}

async function checkGit(cwd: string): Promise<DiagnosticResult> {
  return new Promise((resolve) => {
    const child = spawn('git', ['--version'], { cwd });
    let output = '';
    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.on('error', () => resolve({ name: 'Git', status: 'warn', message: 'git not found in PATH' }));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ name: 'Git', status: 'pass', message: output.trim() });
      } else {
        resolve({ name: 'Git', status: 'warn', message: 'git found but returned error' });
      }
    });
  });
}

async function checkNode(): Promise<DiagnosticResult> {
  return { name: 'Node.js', status: 'pass', message: `Version ${process.version}` };
}

async function checkSessionDir(): Promise<DiagnosticResult> {
  const sessionsDir = path.join(homedir(), '.mimo-code', 'sessions');
  try {
    const stats = await stat(sessionsDir);
    if (stats.isDirectory()) {
      return { name: 'Sessions Dir', status: 'pass', message: sessionsDir };
    }
    return { name: 'Sessions Dir', status: 'warn', message: 'Sessions path exists but is not a directory' };
  } catch {
    return { name: 'Sessions Dir', status: 'warn', message: 'Not yet created (will be created on first save)' };
  }
}

async function checkProjectConfig(cwd: string): Promise<DiagnosticResult> {
  try {
    await access(path.join(cwd, '.mimo-code.json'));
    return { name: 'Project Config', status: 'pass', message: '.mimo-code.json found in workspace' };
  } catch {
    return { name: 'Project Config', status: 'warn', message: 'No .mimo-code.json in workspace. Use /init to create one.' };
  }
}

async function checkConnectivity(config: RuntimeConfig): Promise<DiagnosticResult> {
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`, {
      method: 'GET',
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      return { name: 'API Connection', status: 'pass', message: `Connected to ${config.baseUrl}` };
    }
    return { name: 'API Connection', status: 'warn', message: `API returned ${response.status}` };
  } catch {
    return { name: 'API Connection', status: 'fail', message: `Cannot reach ${config.baseUrl}` };
  }
}

export async function runDiagnostics(config: RuntimeConfig, cwd: string): Promise<DiagnosticResult[]> {
  return Promise.all([
    checkApiKey(config),
    checkConfigFile(),
    checkGit(cwd),
    checkNode(),
    checkSessionDir(),
    checkProjectConfig(cwd),
    checkConnectivity(config),
  ]);
}

export function formatDiagnostics(results: DiagnosticResult[]): string {
  const icon = (status: string) => {
    if (status === 'pass') return '✓';
    if (status === 'warn') return '!';
    return '✗';
  };
  return results.map((result) => `[${icon(result.status)}] ${result.name}: ${result.message}`).join('\n');
}
