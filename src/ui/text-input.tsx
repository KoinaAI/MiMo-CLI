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
  /** Reports the current cursor offset every time it moves. Used by the
   * parent to drive `@`-mention suggestion popups, which need to know the
   * caret position to detect the active mention token. */
  onCursorChange?(cursor: number): void;
  /** Optional override that lets the parent reposition the cursor when it
   * programmatically rewrites the value (e.g. after accepting a mention
   * completion). Setting this to a number forces the internal cursor to
   * that offset on the next render. */
  cursorOverride?: number | undefined;
}

export function MimoTextInput({
  value,
  placeholder = '',
  focus = true,
  showCursor = true,
  onChange,
  onSubmit,
  onCursorChange,
  cursorOverride,
}: MimoTextInputProps): React.ReactElement {
  const [cursor, setCursor] = useState(value.length);

  useEffect(() => {
    setCursor((current) => Math.min(current, value.length));
  }, [value.length]);

  useEffect(() => {
    if (cursorOverride === undefined) return;
    setCursor(Math.max(0, Math.min(value.length, cursorOverride)));
  }, [cursorOverride, value.length]);

  useEffect(() => {
    onCursorChange?.(cursor);
  }, [cursor, onCursorChange]);

  useInput(
    (input, key) => {
      // Defer to the parent's global handlers for these chords; do not insert
      // their input character into the buffer.
      if (key.tab || key.escape) return;
      if (key.upArrow || key.downArrow) return;
      if (key.ctrl && (input === 'c' || input === 'l' || input === 'u' || input === 'w')) return;
      if (key.ctrl && input === 'j') {
        const next = value.slice(0, cursor) + '\n' + value.slice(cursor);
        onChange(next);
        setCursor(cursor + 1);
        return;
      }

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

  const renderValue = (text: string, cursorIndex: number | undefined): string => {
    let rendered = '';
    for (let i = 0; i <= text.length; i += 1) {
      if (i === cursorIndex) rendered += chalk.inverse(text[i] ?? ' ');
      if (i < text.length && i !== cursorIndex) rendered += text[i];
    }
    return rendered;
  };

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

  const lines = value.split('\n');
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }

  return (
    <Text>
      {lines.map((line, index) => {
        const start = offsets[index] ?? 0;
        const end = start + line.length;
        const cursorInLine = focus && showCursor && cursor >= start && cursor <= end ? cursor - start : undefined;
        const content = cursorInLine === undefined ? line : renderValue(line, cursorInLine);
        return `${index === 0 ? '' : '\n'}${content}`;
      }).join('')}
    </Text>
  );
}

export default MimoTextInput;
