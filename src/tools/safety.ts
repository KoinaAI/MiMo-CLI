/**
 * Shell command safety analysis.
 *
 * Detects potentially dangerous patterns before execution to prevent
 * accidental damage. Inspired by DeepSeek TUI's command_safety module
 * and OpenCode's permission/arity system.
 */

export type RiskLevel = 'safe' | 'moderate' | 'dangerous';

export interface SafetyResult {
  level: RiskLevel;
  warnings: string[];
  requiresApproval: boolean;
}

/** Commands that are always dangerous and need approval. */
const DANGEROUS_COMMANDS = new Set([
  'rm -rf',
  'rm -r',
  'rmdir',
  'mkfs',
  'dd',
  'format',
  'fdisk',
  'shutdown',
  'reboot',
  'init 0',
  'init 6',
  'halt',
  'poweroff',
  ':(){:|:&};:',        // fork bomb
  'chmod -R 777',
  'chmod -R 000',
  'chown -R',
  'kill -9',
  'killall',
  'pkill',
]);

/** Commands that modify system state and need caution. */
const MODERATE_COMMANDS = new Set([
  'git push',
  'git push --force',
  'git push -f',
  'git reset --hard',
  'git clean -fd',
  'git checkout --',
  'git stash drop',
  'npm publish',
  'yarn publish',
  'docker rm',
  'docker rmi',
  'docker system prune',
  'pip install',
  'npm install -g',
  'yarn global add',
  'sudo',
  'su',
  'curl | sh',
  'curl | bash',
  'wget -O - | sh',
  'mv /',
  'cp -r /',
]);

/** Dangerous patterns matched via regex. */
const DANGEROUS_PATTERNS: [RegExp, string][] = [
  [/>\s*\/dev\/sd[a-z]/, 'Writing directly to block device'],
  [/rm\s+(-[a-z]*f[a-z]*\s+)?\//, 'Removing from root filesystem'],
  [/chmod\s+-R\s+[0-7]{3}\s+\//, 'Recursive permission change on root'],
  [/>\s*\/etc\//, 'Overwriting system configuration'],
  [/mkfs/, 'Formatting filesystem'],
  [/dd\s+.*of=\/dev\//, 'Writing to raw device'],
  [/curl\s+.*\|\s*(ba)?sh/, 'Piping remote script to shell'],
  [/wget\s+.*\|\s*(ba)?sh/, 'Piping remote script to shell'],
  [/eval\s*\$\(curl/, 'Evaluating remote code'],
  [/git\s+push\s+.*--force\b/, 'Force pushing to remote'],
  [/git\s+reset\s+--hard/, 'Hard resetting git history'],
  [/:\s*\(\)\s*\{/, 'Potential fork bomb'],
  [/>\s*\/dev\/null\s*2>&1\s*&\s*disown/, 'Running hidden background process'],
];

/** Safe read-only commands that never need approval. */
const SAFE_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'less', 'more', 'wc', 'file', 'which', 'type',
  'echo', 'printf', 'date', 'whoami', 'hostname', 'uname', 'pwd', 'env',
  'git status', 'git log', 'git diff', 'git show', 'git branch', 'git remote',
  'git rev-parse', 'git describe', 'git tag',
  'node --version', 'npm --version', 'python --version', 'cargo --version',
  'find', 'grep', 'rg', 'ag', 'fd', 'tree',
  'npm list', 'npm ls', 'npm view', 'npm info',
  'du', 'df', 'stat', 'readlink',
]);

/**
 * Analyze a shell command for potential risks.
 */
export function analyzeCommand(command: string): SafetyResult {
  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();
  const warnings: string[] = [];

  // Check for dangerous patterns first
  for (const [pattern, description] of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      warnings.push(description);
    }
  }

  // Check exact dangerous commands
  for (const dangerous of DANGEROUS_COMMANDS) {
    if (lower.startsWith(dangerous)) {
      warnings.push(`Dangerous command: ${dangerous}`);
    }
  }

  if (warnings.length > 0) {
    return { level: 'dangerous', warnings, requiresApproval: true };
  }

  // Check moderate-risk commands
  for (const moderate of MODERATE_COMMANDS) {
    if (lower.startsWith(moderate) || lower.includes(` ${moderate}`)) {
      warnings.push(`Potentially risky command: ${moderate}`);
    }
  }

  if (warnings.length > 0) {
    return { level: 'moderate', warnings, requiresApproval: true };
  }

  // Check if it's a known safe command
  for (const safe of SAFE_COMMANDS) {
    if (lower.startsWith(safe)) {
      return { level: 'safe', warnings: [], requiresApproval: false };
    }
  }

  // Unknown commands default to moderate (require approval in strict mode)
  return { level: 'moderate', warnings: [], requiresApproval: false };
}

/**
 * Format safety result for display.
 */
export function formatSafetyResult(result: SafetyResult): string {
  if (result.level === 'safe') return '';
  const icon = result.level === 'dangerous' ? '🚨' : '⚠️';
  const lines = [`${icon} ${result.level.toUpperCase()} risk command`];
  for (const warning of result.warnings) {
    lines.push(`  • ${warning}`);
  }
  return lines.join('\n');
}
