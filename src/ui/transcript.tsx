import React from 'react';
import { Box, Text } from 'ink';
import { renderMarkdown } from './markdown.js';
import { DiffView, isLikelyDiff } from './diff.js';

export type TranscriptKind =
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool_call'
  | 'tool_result'
  | 'thinking'
  | 'diff'
  | 'error';

export interface TranscriptMessage {
  id: string | number;
  kind: TranscriptKind;
  title: string;
  body: string;
  timestamp?: string | undefined;
  durationMs?: number | undefined;
  /** When true the body is hidden until the user toggles it via /expand. */
  collapsed?: boolean | undefined;
  /** Index used by /expand <n> commands. */
  index?: number | undefined;
}

interface MessageProps {
  message: TranscriptMessage;
  onMeasureHeight?: (height: number) => void;
}

/**
 * Single transcript entry. Each entry is presented as a header line with a
 * sigil + title, followed by the body. We deliberately avoid trailing
 * `<Newline />` blocks so messages don't double-space when stacked.
 */
export function TranscriptEntry({ message }: MessageProps): React.ReactElement {
  const { sigil, color } = decoration(message.kind);
  const ts = message.timestamp ? ` ${message.timestamp}` : '';
  const duration = message.durationMs !== undefined ? ` · ${formatDurationShort(message.durationMs)}` : '';
  const idxLabel = message.index !== undefined ? ` #${message.index}` : '';
  return (
    <Box flexDirection="column" marginBottom={0}>
      <Text>
        <Text color={color} bold>{sigil} {message.title}</Text>
        <Text dimColor>{idxLabel}{ts}{duration}</Text>
      </Text>
      {!message.collapsed && message.body ? <MessageBody message={message} /> : null}
      {message.collapsed ? (
        <Text dimColor>  … collapsed{message.index !== undefined ? ` (use /expand ${message.index})` : ''}</Text>
      ) : null}
    </Box>
  );
}

function MessageBody({ message }: { message: TranscriptMessage }): React.ReactElement {
  if (message.kind === 'tool_result' && isLikelyDiff(message.body)) {
    return <DiffView body={message.body} />;
  }
  if (message.kind === 'diff') {
    return <DiffView body={message.body} />;
  }
  if (message.kind === 'assistant') {
    // Already rendered through markdown helper before reaching here.
    return <Text>{message.body}</Text>;
  }
  // Default: keep whitespace as-is so tool output and code remain aligned.
  return <Text>{message.body}</Text>;
}

export function decoration(kind: TranscriptKind): { sigil: string; color: 'gray' | 'green' | 'cyan' | 'yellow' | 'red' | 'magenta' } {
  switch (kind) {
    case 'user':
      return { sigil: '▎ you', color: 'green' };
    case 'assistant':
      return { sigil: '▎ mimo', color: 'cyan' };
    case 'thinking':
      return { sigil: '▎ thinking', color: 'gray' };
    case 'tool_call':
      return { sigil: '⏵', color: 'yellow' };
    case 'tool_result':
      return { sigil: '↪', color: 'gray' };
    case 'diff':
      return { sigil: '±', color: 'magenta' };
    case 'error':
      return { sigil: '✖', color: 'red' };
    default:
      return { sigil: '•', color: 'gray' };
  }
}

function formatDurationShort(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m${s}s`;
}

/**
 * Convenience helper to wrap an assistant body through the markdown renderer
 * when constructing transcript entries. Kept here so call sites don't need
 * to know about the markdown module.
 */
export function renderAssistantBody(content: string): string {
  return renderMarkdown(content);
}
