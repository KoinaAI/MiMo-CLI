import { describe, expect, it, beforeEach } from 'vitest';
import {
  evaluateNetworkAccess,
  setNetworkPolicy,
  resetNetworkPolicy,
  allowHost,
  denyHost,
  formatNetworkPolicy,
  getNetworkPolicy,
} from '../src/policy/network.js';

describe('network policy', () => {
  beforeEach(() => {
    resetNetworkPolicy();
  });

  it('defaults to allow', () => {
    expect(evaluateNetworkAccess('example.com')).toBe('allow');
  });

  it('denies hosts on deny list', () => {
    denyHost('evil.com');
    expect(evaluateNetworkAccess('evil.com')).toBe('deny');
    expect(evaluateNetworkAccess('good.com')).toBe('allow');
  });

  it('allows hosts on allow list when default is deny', () => {
    setNetworkPolicy({ defaultDecision: 'deny', allowList: ['trusted.com'] });
    expect(evaluateNetworkAccess('trusted.com')).toBe('allow');
    expect(evaluateNetworkAccess('other.com')).toBe('deny');
  });

  it('deny takes precedence over allow', () => {
    allowHost('example.com');
    denyHost('example.com');
    expect(evaluateNetworkAccess('example.com')).toBe('deny');
  });

  it('supports subdomain matching with dot prefix', () => {
    denyHost('.evil.com');
    expect(evaluateNetworkAccess('sub.evil.com')).toBe('deny');
    expect(evaluateNetworkAccess('evil.com')).toBe('deny');
    expect(evaluateNetworkAccess('notevil.com')).toBe('allow');
  });

  it('formats policy for display', () => {
    denyHost('blocked.com');
    const output = formatNetworkPolicy();
    expect(output).toContain('blocked.com');
    expect(output).toContain('Deny');
  });

  it('formats empty policy after reset', () => {
    resetNetworkPolicy();
    const output = formatNetworkPolicy();
    expect(output).toContain('No custom rules');
  });

  it('gets current policy', () => {
    const policy = getNetworkPolicy();
    expect(policy.defaultDecision).toBe('allow');
  });
});
