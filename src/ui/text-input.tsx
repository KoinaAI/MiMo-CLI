import React, { useEffect, useState } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

/**
 * Replacement for `ink-text-input` with explicit cursor tracking.
 *
 * The upstream component re-syncs the cursor offset only when the controlled
 * value's length shrinks below the current offset, which (a) leaves the cursor
 * stranded mid-string when the parent replaces the value via history navigation
 * and (b) interacts badly with surrounding `useInput` handlers. This component
 * always clamps the cursor to a valid position, exposes Home / End / Ctrl+A /
 * Ctrl+E / Ctrl+K / Delete bindings, and ignores keys that the parent's
 * `useInput` is expected to handle (Ctrl+C, Ctrl+L, Ctrl+U, Ctrl+W, Tab, Esc,
 * arrow keys for history) so they fire exactly once.
 */
export interface MimoTextInputProps {
  value: string;
  placeholder?: string;
  focus?: boolean;
  showCursor?: boolean;
  onChange(value: string): void;
  onSubmit?(value: string): void;
}

export function MimoTextInput({
  value,
  placeholder = '',
  focus = true,
  showCursor = true,
  onChange,
  onSubmit,
}: MimoTextInputProps): React.ReactElement {
  const [cursor, setCursor] = useState(value.length);

  useEffect(() => {
    setCursor((current) => Math.min(current, value.length));
  }, [value.length]);

  useInput(
    (input, key) => {
      // Defer to the parent's global handlers for these chords; do not insert
      // their input character into the buffer.
      if (key.tab || key.escape) return;
      if (key.upArrow || key.downArrow) return;
      if (key.ctrl && (input === 'c' || input === 'l' || input === 'u' || input === 'w')) return;

      if (key.return) {
        onSubmit?.(value);
        return;
      }
      if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1));
        return;
      }
      if (key.home || (key.ctrl && input === 'a')) {
        setCursor(0);
        return;
      }
      if (key.end || (key.ctrl && input === 'e')) {
        setCursor(value.length);
        return;
      }
      if (key.backspace) {
        if (cursor === 0) return;
        const next = value.slice(0, cursor - 1) + value.slice(cursor);
        onChange(next);
        setCursor(cursor - 1);
        return;
      }
      if (key.delete) {
        if (cursor >= value.length) return;
        const next = value.slice(0, cursor) + value.slice(cursor + 1);
        onChange(next);
        return;
      }
      if (key.ctrl && input === 'k') {
        onChange(value.slice(0, cursor));
        return;
      }
      if (key.ctrl || key.meta) return;
      if (!input) return;
      const next = value.slice(0, cursor) + input + value.slice(cursor);
      onChange(next);
      setCursor(cursor + input.length);
    },
    { isActive: focus },
  );

  if (value.length === 0) {
    if (!focus || !showCursor) {
      return <Text>{placeholder ? chalk.grey(placeholder) : ''}</Text>;
    }
    if (placeholder) {
      const head = placeholder[0] ?? ' ';
      return <Text>{chalk.inverse(head) + chalk.grey(placeholder.slice(1))}</Text>;
    }
    return <Text>{chalk.inverse(' ')}</Text>;
  }

  if (!focus || !showCursor) {
    return <Text>{value}</Text>;
  }

  let rendered = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] ?? '';
    rendered += i === cursor ? chalk.inverse(ch) : ch;
  }
  if (cursor === value.length) rendered += chalk.inverse(' ');
  return <Text>{rendered}</Text>;
}

export default MimoTextInput;
