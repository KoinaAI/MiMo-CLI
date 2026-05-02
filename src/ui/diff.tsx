import React from 'react';
import { Box, Text } from 'ink';

/**
 * Detect whether a tool result string looks like a unified diff.
 *
 * We look for the conventional headers (`Index:`, `--- `/`+++ `, `@@`) that
 * `edit_file`, `apply_patch`, and `multi_edit` produce.
 */
export function isLikelyDiff(text: string): boolean {
  if (!text) return false;
  const hasHeader = /^(Index:|---\s|\+\+\+\s|diff\s)/m.test(text);
  const hasHunk = /^@@\s/m.test(text);
  return hasHeader && hasHunk;
}

interface DiffProps {
  body: string;
  maxLines?: number;
}

/**
 * Inline diff renderer. Lines starting with `+` are green, `-` are red,
 * `@@` are cyan, and everything else is dimmed.
 */
export function DiffView({ body, maxLines = 60 }: DiffProps): React.ReactElement {
  const allLines = body.split('\n');
  const truncated = allLines.length > maxLines;
  const visible = truncated ? allLines.slice(0, maxLines) : allLines;
  return (
    <Box flexDirection="column">
      {visible.map((line, idx) => (
        <DiffLine key={idx} line={line} />
      ))}
      {truncated ? (
        <Text dimColor>… {allLines.length - maxLines} more lines (use /expand for full diff)</Text>
      ) : null}
    </Box>
  );
}

function DiffLine({ line }: { line: string }): React.ReactElement {
  if (line.startsWith('+++') || line.startsWith('---')) {
    return <Text dimColor bold>{line}</Text>;
  }
  if (line.startsWith('@@')) {
    return <Text color="cyan">{line}</Text>;
  }
  if (line.startsWith('+')) {
    return <Text color="green">{line}</Text>;
  }
  if (line.startsWith('-')) {
    return <Text color="red">{line}</Text>;
  }
  if (line.startsWith('diff ') || line.startsWith('Index:')) {
    return <Text bold>{line}</Text>;
  }
  return <Text dimColor>{line}</Text>;
}
