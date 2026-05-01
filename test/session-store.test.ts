import { describe, expect, it } from 'vitest';
import { appendSessionMessages, createSession } from '../src/session/store.js';

describe('session records', () => {
  it('creates and appends reusable session messages', () => {
    const session = createSession('Work', '/repo');
    const updated = appendSessionMessages(session, [{ role: 'user', content: 'hello' }]);
    expect(updated.id).toBe(session.id);
    expect(updated.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });
});
