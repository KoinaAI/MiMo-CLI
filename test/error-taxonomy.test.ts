import { describe, expect, it } from 'vitest';
import { classifyError, formatClassifiedError } from '../src/utils/errors.js';

describe('error taxonomy', () => {
  it('classifies rate limit errors', () => {
    const result = classifyError(new Error('Rate limit exceeded'));
    expect(result.category).toBe('api');
    expect(result.retryable).toBe(true);
    expect(result.suggestion).toBeDefined();
  });

  it('classifies 401 errors', () => {
    const result = classifyError(new Error('Unauthorized (401)'));
    expect(result.category).toBe('api');
    expect(result.retryable).toBe(false);
  });

  it('classifies network errors', () => {
    const result = classifyError(new Error('ECONNREFUSED'));
    expect(result.category).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('classifies timeout errors', () => {
    const result = classifyError(new Error('Request timeout'));
    expect(result.category).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('classifies filesystem errors', () => {
    const result = classifyError(new Error('ENOENT: no such file'));
    expect(result.category).toBe('filesystem');
    expect(result.retryable).toBe(false);
  });

  it('classifies permission errors', () => {
    const result = classifyError(new Error('EACCES: permission denied'));
    expect(result.category).toBe('permission');
    expect(result.retryable).toBe(false);
  });

  it('classifies unknown errors as internal', () => {
    const result = classifyError(new Error('something weird'));
    expect(result.category).toBe('internal');
    expect(result.retryable).toBe(false);
  });

  it('handles non-Error values', () => {
    const result = classifyError('string error');
    expect(result.category).toBe('internal');
    expect(result.message).toBe('string error');
  });

  it('formats classified error', () => {
    const err = classifyError(new Error('ECONNREFUSED'));
    const formatted = formatClassifiedError(err);
    expect(formatted).toContain('[network]');
    expect(formatted).toContain('ECONNREFUSED');
  });
});
