/**
 * Network policy for controlling outbound access.
 *
 * Provides domain allow/deny lists for web tools (web_fetch, web_search).
 * Inspired by DeepSeek TUI's network_policy module.
 */

export type NetworkDecision = 'allow' | 'deny' | 'prompt';

export interface NetworkPolicy {
  defaultDecision: NetworkDecision;
  allowList: string[];
  denyList: string[];
}

function freshPolicy(): NetworkPolicy {
  return { defaultDecision: 'allow', allowList: [], denyList: [] };
}

let currentPolicy: NetworkPolicy = freshPolicy();

/**
 * Set the current network policy.
 */
export function setNetworkPolicy(policy: Partial<NetworkPolicy>): void {
  currentPolicy = { ...freshPolicy(), ...policy };
}

/**
 * Get the current network policy.
 */
export function getNetworkPolicy(): NetworkPolicy {
  return { ...currentPolicy };
}

/**
 * Reset to default (allow all) policy.
 */
export function resetNetworkPolicy(): void {
  currentPolicy = freshPolicy();
}

/**
 * Check if a host matches a pattern.
 * Supports exact match and subdomain match (patterns starting with ".").
 */
function matchHost(host: string, pattern: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  const p = pattern.toLowerCase().replace(/\.$/, '');
  if (h === p) return true;
  if (p.startsWith('.') && (h.endsWith(p) || h === p.slice(1))) return true;
  return false;
}

/**
 * Evaluate whether an outbound request to a host is allowed.
 * Deny-wins: a host in both allow and deny lists is denied.
 */
export function evaluateNetworkAccess(host: string): NetworkDecision {
  // Deny list takes precedence
  for (const pattern of currentPolicy.denyList) {
    if (matchHost(host, pattern)) return 'deny';
  }
  // Explicit allow
  for (const pattern of currentPolicy.allowList) {
    if (matchHost(host, pattern)) return 'allow';
  }
  return currentPolicy.defaultDecision;
}

/**
 * Add a host to the allow list.
 */
export function allowHost(host: string): void {
  if (!currentPolicy.allowList.includes(host)) {
    currentPolicy.allowList.push(host);
  }
  // Remove from deny list if present
  currentPolicy.denyList = currentPolicy.denyList.filter((h) => h !== host);
}

/**
 * Add a host to the deny list.
 */
export function denyHost(host: string): void {
  if (!currentPolicy.denyList.includes(host)) {
    currentPolicy.denyList.push(host);
  }
  // Remove from allow list if present
  currentPolicy.allowList = currentPolicy.allowList.filter((h) => h !== host);
}

/**
 * Format the current network policy for display.
 */
export function formatNetworkPolicy(): string {
  const lines = [`Network Policy (default: ${currentPolicy.defaultDecision})`];
  if (currentPolicy.allowList.length > 0) {
    lines.push(`  Allow: ${currentPolicy.allowList.join(', ')}`);
  }
  if (currentPolicy.denyList.length > 0) {
    lines.push(`  Deny: ${currentPolicy.denyList.join(', ')}`);
  }
  if (currentPolicy.allowList.length === 0 && currentPolicy.denyList.length === 0) {
    lines.push('  No custom rules configured');
  }
  return lines.join('\n');
}
