import React, { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'ink-testing-library';
import { MimoTextInput } from '../src/ui/text-input.js';

interface HarnessProps {
  initial: string;
  onValue?(value: string): void;
  onSubmit?(value: string): void;
}

function Harness({ initial, onValue, onSubmit }: HarnessProps): React.ReactElement {
  const [value, setValue] = useState(initial);
  return (
    <MimoTextInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      onSubmit={onSubmit}
    />
  );
}

const ESC_FLUSH_MS = 30;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('MimoTextInput', () => {
  it('inserts printable characters at the cursor', () => {
    let captured = '';
    const { stdin } = render(<Harness initial="" onValue={(v) => { captured = v; }} />);
    stdin.write('hi');
    expect(captured).toBe('hi');
  });

  it('deletes left of the cursor on backspace', () => {
    let captured = 'abc';
    const { stdin } = render(<Harness initial="abc" onValue={(v) => { captured = v; }} />);
    // Backspace key (\u007f).
    stdin.write('\u007f');
    expect(captured).toBe('ab');
  });

  it('deletes right of the cursor on the DEL key', async () => {
    let captured = 'abc';
    const { stdin } = render(<Harness initial="abc" onValue={(v) => { captured = v; }} />);
    // Home, then forward-delete. Wait for Ink's pending-escape flush between writes.
    stdin.write('\u001b[H');
    await wait(ESC_FLUSH_MS);
    stdin.write('\u001b[3~');
    await wait(ESC_FLUSH_MS);
    expect(captured).toBe('bc');
  });

  it('moves the cursor with left/right arrows and inserts in the middle', async () => {
    let captured = 'ac';
    const { stdin } = render(<Harness initial="ac" onValue={(v) => { captured = v; }} />);
    stdin.write('\u001b[D');
    await wait(ESC_FLUSH_MS);
    stdin.write('b');
    expect(captured).toBe('abc');
  });

  it('submits with Enter and ignores Tab/Esc/up/down arrows', async () => {
    let submitted: string | undefined;
    let captured = '';
    const { stdin } = render(
      <Harness initial="" onValue={(v) => { captured = v; }} onSubmit={(v) => { submitted = v; }} />,
    );
    stdin.write('hi');
    // Up/Down/Tab/Esc must not modify value.
    stdin.write('\u001b[A');
    await wait(ESC_FLUSH_MS);
    stdin.write('\u001b[B');
    await wait(ESC_FLUSH_MS);
    stdin.write('\t');
    stdin.write('\u001b');
    await wait(ESC_FLUSH_MS);
    expect(captured).toBe('hi');
    stdin.write('\r');
    expect(submitted).toBe('hi');
  });

  it('does not throw when the parent shrinks the value below the cursor', () => {
    const { rerender } = render(<Harness initial="something" />);
    rerender(<Harness initial="x" />);
    // No assertion needed — the test passes if rendering with a shorter value
    // does not throw because of an out-of-range cursor.
    expect(true).toBe(true);
  });

  it('renders multiline input on separate lines', () => {
    const { lastFrame } = render(<Harness initial={'one\ntwo'} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('one');
    expect(frame).toContain('two');
    expect(frame).toContain('\n');
  });
});
