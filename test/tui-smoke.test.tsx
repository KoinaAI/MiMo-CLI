import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { TranscriptEntry } from '../src/ui/transcript.js';
import { SPLASH } from '../src/ui/theme.js';

describe('Transcript splash rendering', () => {
  it('renders a splash entry without a header line', () => {
    const { lastFrame } = render(
      <TranscriptEntry message={{ id: 1, kind: 'splash', title: '', body: SPLASH }} />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Welcome to MiMo Code');
    // The `splash` kind must not render the dim "•" sigil that the default
    // case otherwise produces.
    expect(frame).not.toContain('• ');
  });

  it('renders the user kind without a doubled "▎ you you" header', () => {
    const { lastFrame } = render(
      <TranscriptEntry
        message={{ id: 2, kind: 'user', title: 'you', body: 'hello' }}
      />,
    );
    const frame = lastFrame() ?? '';
    // Strip ANSI for a stable assertion.
    // eslint-disable-next-line no-control-regex
    const plain = frame.replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('▎ you');
    expect(plain).not.toContain('▎ you you');
  });
});
