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
  | 'error'
  | 'splash'
  | 'divider';

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
  /** Append mode means later user prompts continue the same turn context. */
  merge?: 'append' | undefined;
  summary?: string | undefined;
}

interface MessageProps {
  message: TranscriptMessage;
  onMeasureHeight?: (height: number) => void;
}

/**
 * Single transcript entry. Each entry is presented as a header line with a
 * sigil + title, followed by the body. We deliberately avoid trailing
 * `<Newline />` blocks so messages don't double-space when stacked.
 *
 * The component is wrapped in `React.memo` (see export below) and rendered
 * inside Ink's `<Static>` so committed entries never re-render after they
 * land — that's what gives the transcript its "Codex-smooth" feel.
 */
function TranscriptEntryImpl({ message }: MessageProps): React.ReactElement {
  if (message.kind === 'splash') {
    return (
      <Box flexDirection="column" marginBottom={0}>
        <Text>{message.body}</Text>
      </Box>
    );
  }

  if (message.kind === 'divider') {
    return (
      <Box marginY={0}>
        <Text dimColor>{message.body}</Text>
      </Box>
    );
  }

  const { sigil, color } = decoration(message.kind);
  const ts = message.timestamp ? ` ${message.timestamp}` : '';
  const duration = message.durationMs !== undefined ? ` · ${formatDurationShort(message.durationMs)}` : '';
  const idxLabel = message.index !== undefined ? ` #${message.index}` : '';
  const isToolish = message.kind === 'tool_call' || message.kind === 'tool_result';
  const headerBold = !isToolish && message.kind !== 'thinking';
  return (
    <Box flexDirection="column" marginBottom={isToolish ? 0 : 1}>
      <Text>
        <Text color={color} bold={headerBold}>{sigil} {message.title}</Text>
        <Text dimColor>{message.summary ? ` ${message.summary}` : ''}{idxLabel}{ts}{duration}{message.merge === 'append' ? ' · appendable' : ''}</Text>
      </Text>
      {!message.collapsed && message.body ? <MessageBody message={message} /> : null}
      {message.collapsed ? (
        <Text dimColor>  … {message.index !== undefined ? `/expand ${message.index}` : 'collapsed'}</Text>
      ) : null}
    </Box>
  );
}

export const TranscriptEntry = React.memo(TranscriptEntryImpl, (prev, next) => {
  // Once a transcript entry is appended, only an explicit replacement (new
  // id) should re-render it. Comparing by id keeps the comparison cheap and
  // makes the memo predictable when we render through Ink's <Static>.
  return prev.message.id === next.message.id
    && prev.message.collapsed === next.message.collapsed
    && prev.message.body === next.message.body
    && prev.message.summary === next.message.summary
    && prev.message.title === next.message.title;
});

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
      return { sigil: '▎', color: 'green' };
    case 'assistant':
      return { sigil: '▎', color: 'cyan' };
    case 'thinking':
      return { sigil: '✢', color: 'gray' };
    case 'tool_call':
      // Tool calls are background chrome — a single dim dot keeps them
      // visually grouped with the result that follows immediately below.
      return { sigil: '·', color: 'gray' };
    case 'tool_result':
      return { sigil: '↳', color: 'gray' };
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
