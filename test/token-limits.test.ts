import { describe, expect, it } from 'vitest';
import { clampMaxTokens, maxOutputTokensForModel, parsePersistedConfig } from '../src/config/config.js';

describe('model token limits', () => {
  it('uses 131072 for non-flash models', () => {
    expect(maxOutputTokensForModel('mimo-v2.5-pro')).toBe(131_072);
    expect(maxOutputTokensForModel('mimo-v2.5')).toBe(131_072);
    expect(maxOutputTokensForModel('mimo-v2-pro')).toBe(131_072);
    expect(maxOutputTokensForModel('mimo-v2-omni')).toBe(131_072);
  });

  it('uses 65536 for flash', () => {
    expect(maxOutputTokensForModel('mimo-v2-flash')).toBe(65_536);
    expect(clampMaxTokens('mimo-v2-flash', 131_072)).toBe(65_536);
  });

  it('parses mcp and skill config', () => {
    expect(
      parsePersistedConfig(
        {
          mcpServers: [{ name: 'fs', command: 'npx', args: ['server'], env: { A: 'B' } }],
          skills: [{ name: 'review', path: './skills/review.md', description: 'Review code' }],
        },
        'test',
      ),
    ).toEqual({
      mcpServers: [{ name: 'fs', command: 'npx', args: ['server'], env: { A: 'B' } }],
      skills: [{ name: 'review', path: './skills/review.md', description: 'Review code' }],
    });
  });
});
