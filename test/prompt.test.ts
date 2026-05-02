import { describe, expect, it } from 'vitest';
import { resolveSystemPrompt, DEFAULT_SYSTEM_PROMPT, PLAN_MODE_SYSTEM_PROMPT, YOLO_MODE_SYSTEM_PROMPT } from '../src/agent/prompt.js';

describe('system prompts', () => {
  it('resolves agent mode to default prompt', () => {
    const prompt = resolveSystemPrompt('agent');
    expect(prompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('resolves plan mode to plan prompt', () => {
    const prompt = resolveSystemPrompt('plan');
    expect(prompt).toBe(PLAN_MODE_SYSTEM_PROMPT);
  });

  it('resolves yolo mode to yolo prompt', () => {
    const prompt = resolveSystemPrompt('yolo');
    expect(prompt).toBe(YOLO_MODE_SYSTEM_PROMPT);
  });

  it('plan prompt forbids modifications', () => {
    expect(PLAN_MODE_SYSTEM_PROMPT.toLowerCase()).toMatch(/read.only|no.modify|inspection|do not/i);
  });

  it('yolo prompt mentions auto approval', () => {
    expect(YOLO_MODE_SYSTEM_PROMPT.toLowerCase()).toContain('automatically approved');
  });

  it('default prompt mentions caution rules', () => {
    expect(DEFAULT_SYSTEM_PROMPT.toLowerCase()).toContain('careful');
  });
});
