import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Newline, render, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { execSync } from 'node:child_process';
import { CodingAgent } from '../agent/agent.js';
import { formatCost } from '../agent/usage.js';
import { compactMessages, formatContextStats } from '../context/compaction.js';
import { runDiagnostics, formatDiagnostics } from '../doctor/checks.js';
import { addMemoryNote, listMemoryNotes } from '../memory/store.js';
import { createConfigWizardState, saveWizardConfig, updateWizard, wizardPrompt, wizardSummary } from '../config/tui-wizard.js';
import { createSession, listSessions, readSession, saveSession, exportSession } from '../session/store.js';
import { getTodoStore } from '../tools/todo.js';
import { formatNetworkPolicy, allowHost, denyHost, resetNetworkPolicy } from '../policy/network.js';
import { renderMarkdown } from './markdown.js';
import type {
  AgentEvent,
  AgentOptions,
  ChatMessage,
  CostEstimate,
  InteractionMode,
  RuntimeConfig,
  SessionRecord,
  ToolApprovalDecision,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from '../types.js';
import { errorMessage } from '../utils/errors.js';
import { completeSlashCommand, parseSlashCommand, slashCommandSuggestions, SLASH_COMMAND_HELP } from './commands.js';
import { eventLabel, summarizeToolInput, summarizeToolOutput, formatTimestamp, formatDuration } from './format.js';
import { SPLASH, statusLine, modeIndicator, formatDiffOutput, formatThinkingBlock } from './theme.js';

interface TuiMessage {
  id: number;
  kind: 'system' | 'user' | 'assistant' | 'tool' | 'error' | 'thinking' | 'diff';
  title: string;
  body: string;
  collapsed?: boolean | undefined;
  timestamp?: string | undefined;
  durationMs?: number | undefined;
}

interface PendingApproval {
  toolCall: ToolCall;
  tool: ToolDefinition;
  resolve(decision: ToolApprovalDecision): void;
}

interface TuiAppProps {
  config: RuntimeConfig;
  tools: ToolDefinition[];
  options: AgentOptions;
}

type ConfigWizard = Awaited<ReturnType<typeof createConfigWizardState>>;

export async function runTui(config: RuntimeConfig, tools: ToolDefinition[], options: AgentOptions): Promise<void> {
  const instance = render(<TuiApp config={config} tools={tools} options={options} />);
  await instance.waitUntilExit();
}

function TuiApp({ config, tools, options }: TuiAppProps): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<TuiMessage[]>(() => [
    {
      id: 1,
      kind: 'system',
      title: 'Welcome',
      body: `${SPLASH}\nType /help for commands · Tab completes · /mode to switch · Ctrl+C to interrupt`,
      timestamp: formatTimestamp(),
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | undefined>();
  const [usage, setUsage] = useState<TokenUsage>({});
  const [sessionCost, setSessionCost] = useState<CostEstimate | undefined>();
  const [alwaysApprove, setAlwaysApprove] = useState(options.autoApprove);
  const [session, setSession] = useState<SessionRecord>(() => createSession('Untitled session', options.cwd));
  const [wizard, setWizard] = useState<ConfigWizard | undefined>();
  const [mode, setMode] = useState<InteractionMode>(options.mode ?? 'agent');
  const [streamingText, setStreamingText] = useState('');
  const alwaysApproveRef = useRef(options.autoApprove);
  const abortRef = useRef<AbortController | null>(null);
  const [inputHistory] = useState<string[]>(() => []);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const toolStartTimes = useRef<Map<string, number>>(new Map());

  const currentOptions = useMemo<AgentOptions>(() => ({
    ...options,
    mode,
    autoApprove: mode === 'yolo' || alwaysApprove,
  }), [options, mode, alwaysApprove]);

  const agent = useMemo(() => new CodingAgent(config, tools, currentOptions), [config, currentOptions, tools]);

  const append = useCallback((message: Omit<TuiMessage, 'id'>) => {
    setMessages((current) => [...current.slice(-200), { ...message, id: Date.now() + Math.random(), timestamp: message.timestamp ?? formatTimestamp() }]);
  }, []);

  const addSessionMessages = useCallback((newMessages: ChatMessage[]) => {
    setSession((current) => ({ ...current, messages: [...current.messages, ...newMessages], updatedAt: new Date().toISOString() }));
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === 'thinking') {
        append({ kind: 'system', title: eventLabel(event), body: 'Waiting for MiMo response…' });
      } else if (event.type === 'assistant_thinking') {
        append({ kind: 'thinking', title: 'Thinking', body: formatThinkingBlock(event.content) });
      } else if (event.type === 'streaming_delta') {
        setStreamingText((current) => current + event.content);
      } else if (event.type === 'assistant_message') {
        setStreamingText('');
        append({ kind: 'assistant', title: 'MiMo', body: renderMarkdown(event.content) });
        addSessionMessages([{ role: 'assistant', content: event.content }]);
      } else if (event.type === 'tool_call') {
        toolStartTimes.current.set(event.id, Date.now());
        append({ kind: 'tool', title: `⚡ ${event.name}`, body: summarizeToolInput(event.input), collapsed: false });
      } else if (event.type === 'tool_result') {
        const startTime = toolStartTimes.current.get(event.id);
        const durationMs = startTime ? Date.now() - startTime : undefined;
        toolStartTimes.current.delete(event.id);
        const durationStr = durationMs ? ` (${formatDuration(durationMs)})` : '';
        append({ kind: 'tool', title: `← ${event.name}${durationStr}`, body: summarizeToolOutput(event.content), collapsed: true, durationMs: durationMs ?? undefined });
      } else if (event.type === 'error') {
        append({ kind: 'error', title: 'Error', body: event.message });
      } else if (event.type === 'done') {
        setUsage(event.result.usage);
        if (event.result.cost) setSessionCost(event.result.cost);
        const costStr = formatCost(event.result.cost);
        append({ kind: 'system', title: 'Done', body: `Iterations: ${event.result.iterations}${costStr ? ` · Cost: ${costStr}` : ''}` });
      }
    },
    [addSessionMessages, append],
  );

  const approveToolCall = useCallback(async (toolCall: ToolCall, tool: ToolDefinition): Promise<ToolApprovalDecision> => {
    if (alwaysApproveRef.current || mode === 'yolo') return 'approve';
    return new Promise((resolve) => {
      setApproval({ toolCall, tool, resolve });
    });
  }, [mode]);

  const handleSlashCommand = useCallback(
    (value: string): boolean => {
      const command = parseSlashCommand(value);
      if (!command) return false;

      if (command.name === 'help') append({ kind: 'system', title: 'Slash commands', body: SLASH_COMMAND_HELP });
      if (command.name === 'exit') exit();
      if (command.name === 'clear') {
        setMessages([{ id: Date.now(), kind: 'system', title: 'Cleared', body: 'Chat cleared. Type /help for commands.', timestamp: formatTimestamp() }]);
      }
      if (command.name === 'config') {
        void createConfigWizardState().then(setWizard).catch((error: unknown) => append({ kind: 'error', title: 'Config', body: errorMessage(error) }));
      }
      if (command.name === 'new') {
        const title = command.args.join(' ') || 'Untitled session';
        setSession(createSession(title, options.cwd));
        setMessages([]);
        append({ kind: 'system', title: 'Session', body: `Started new session: ${title}` });
      }
      if (command.name === 'save') {
        void saveSession(session)
          .then((filePath) => append({ kind: 'system', title: 'Session saved', body: filePath }))
          .catch((error: unknown) => append({ kind: 'error', title: 'Session save failed', body: errorMessage(error) }));
      }
      if (command.name === 'sessions') {
        void listSessions()
          .then((sessions) => append({ kind: 'system', title: 'Sessions', body: formatSessions(sessions) }))
          .catch((error: unknown) => append({ kind: 'error', title: 'Sessions', body: errorMessage(error) }));
      }
      if (command.name === 'load') void loadSession(command.args[0], setSession, append);
      if (command.name === 'mcp') append({ kind: 'system', title: 'MCP servers', body: JSON.stringify(config.mcpServers ?? [], null, 2) });
      if (command.name === 'skill') append({ kind: 'system', title: 'Skills', body: JSON.stringify(config.skills ?? [], null, 2) });
      if (command.name === 'hooks') append({ kind: 'system', title: 'Hooks', body: JSON.stringify(config.hooks ?? [], null, 2) });
      if (command.name === 'tools') {
        const toolLines = tools.map((tool) => {
          const readOnlyTag = tool.readOnly ? ' (read-only)' : '';
          return `  ${tool.name}${readOnlyTag} — ${tool.description}`;
        });
        append({ kind: 'system', title: `Tools (${tools.length})`, body: toolLines.join('\n') });
      }
      if (command.name === 'status') append({ kind: 'system', title: 'Status', body: statusLine(config, session, tools, usage, options.cwd, mode, sessionCost) });

      if (command.name === 'mode') {
        const target = command.args[0];
        if (target === 'plan' || target === 'agent' || target === 'yolo') {
          setMode(target);
          if (target === 'yolo') alwaysApproveRef.current = true;
          append({ kind: 'system', title: 'Mode', body: `Switched to ${modeIndicator(target)}` });
        } else {
          append({ kind: 'system', title: 'Mode', body: `Current: ${modeIndicator(mode)}\nUsage: /mode [plan|agent|yolo]\n  plan  — Read-only investigation\n  agent — Interactive with approval\n  yolo  — Fully autonomous` });
        }
      }
      if (command.name === 'compact') {
        setSession((current) => {
          const compacted = compactMessages(current.messages);
          append({ kind: 'system', title: 'Compact', body: `Compacted ${current.messages.length} → ${compacted.length} messages` });
          return { ...current, messages: compacted, updatedAt: new Date().toISOString() };
        });
      }
      if (command.name === 'diff') {
        try {
          const diff = execSync('git diff --stat --patch', { cwd: options.cwd, encoding: 'utf8', timeout: 10_000 });
          append({ kind: 'diff', title: 'Workspace Diff', body: diff ? formatDiffOutput(diff) : 'No changes detected' });
        } catch {
          append({ kind: 'error', title: 'Diff', body: 'Not a git repository or git not available' });
        }
      }
      if (command.name === 'doctor') {
        void runDiagnostics(config, options.cwd)
          .then((results) => append({ kind: 'system', title: 'Diagnostics', body: formatDiagnostics(results) }))
          .catch((error: unknown) => append({ kind: 'error', title: 'Doctor', body: errorMessage(error) }));
      }
      if (command.name === 'memory') {
        const note = command.args.join(' ');
        if (note) {
          void addMemoryNote(note, options.cwd)
            .then((mem) => append({ kind: 'system', title: 'Memory', body: `Saved note #${mem.id}: ${note}` }))
            .catch((error: unknown) => append({ kind: 'error', title: 'Memory', body: errorMessage(error) }));
        } else {
          void listMemoryNotes(options.cwd)
            .then((notes) => {
              if (notes.length === 0) {
                append({ kind: 'system', title: 'Memory', body: 'No memory notes. Usage: /memory <note text>' });
              } else {
                append({ kind: 'system', title: 'Memory', body: notes.map((n) => `#${n.id} [${n.scope}] ${n.content}`).join('\n') });
              }
            })
            .catch((error: unknown) => append({ kind: 'error', title: 'Memory', body: errorMessage(error) }));
        }
      }
      if (command.name === 'undo') {
        try {
          const result = execSync('git checkout -- .', { cwd: options.cwd, encoding: 'utf8', timeout: 10_000 });
          append({ kind: 'system', title: 'Undo', body: result || 'Reverted all unstaged changes' });
        } catch {
          append({ kind: 'error', title: 'Undo', body: 'Failed to revert. Not a git repository or no changes to undo.' });
        }
      }
      if (command.name === 'init') {
        append({ kind: 'system', title: 'Init', body: 'Use "mimo-code config" or /config to initialize project configuration.' });
      }
      if (command.name === 'bug') {
        const desc = command.args.join(' ');
        if (desc) {
          append({ kind: 'system', title: 'Bug Report', body: `Bug recorded: ${desc}\nPlease report at: https://github.com/KoinaAI/MiMo-CLI/issues` });
        } else {
          append({ kind: 'error', title: 'Bug', body: 'Usage: /bug <description>' });
        }
      }
      if (command.name === 'context') {
        append({ kind: 'system', title: 'Context', body: formatContextStats(session.messages) });
      }
      if (command.name === 'cost') {
        const costStr = formatCost(sessionCost);
        append({ kind: 'system', title: 'Session Cost', body: costStr || 'No cost data yet' });
      }
      if (command.name === 'todo') {
        const todos = getTodoStore();
        if (todos.length === 0) {
          append({ kind: 'system', title: 'Todo', body: 'No tasks in checklist. The agent can use todo_add to track tasks.' });
        } else {
          const statusIcon = (status: string) => status === 'done' ? '[x]' : status === 'in_progress' ? '[~]' : '[ ]';
          append({ kind: 'system', title: 'Todo', body: todos.map((t) => `#${t.id} ${statusIcon(t.status)} ${t.text}`).join('\n') });
        }
      }
      if (command.name === 'network') {
        const subCmd = command.args[0];
        const host = command.args[1];
        if (subCmd === 'allow' && host) {
          allowHost(host);
          append({ kind: 'system', title: 'Network', body: `Allowed: ${host}` });
        } else if (subCmd === 'deny' && host) {
          denyHost(host);
          append({ kind: 'system', title: 'Network', body: `Denied: ${host}` });
        } else if (subCmd === 'reset') {
          resetNetworkPolicy();
          append({ kind: 'system', title: 'Network', body: 'Policy reset to default (allow all)' });
        } else {
          append({ kind: 'system', title: 'Network Policy', body: formatNetworkPolicy() });
        }
      }
      if (command.name === 'export') {
        const outputPath = command.args[0];
        if (!outputPath) {
          append({ kind: 'error', title: 'Export', body: 'Usage: /export <file-path>' });
        } else {
          void exportSession(session.id, outputPath)
            .then((filePath) => append({ kind: 'system', title: 'Exported', body: `Session exported to ${filePath}` }))
            .catch((error: unknown) => append({ kind: 'error', title: 'Export', body: errorMessage(error) }));
        }
      }

      return true;
    },
    [append, config, exit, mode, options.cwd, session, sessionCost, tools, usage],
  );

  const submit = useCallback(
    (value: string) => {
      const task = value.trim();
      if (!task || running) return;
      setPrompt('');
      // Add to input history
      if (task && !task.startsWith('/')) {
        inputHistory.push(task);
        setHistoryIndex(-1);
      }
      if (wizard) {
        void handleWizardInput(task, wizard, setWizard, append);
        return;
      }
      if (handleSlashCommand(task)) return;
      setRunning(true);
      setStreamingText('');
      const controller = new AbortController();
      abortRef.current = controller;
      append({ kind: 'user', title: 'You', body: task });
      const userMessage: ChatMessage = { role: 'user', content: task };
      const history = [...session.messages];
      addSessionMessages([userMessage]);
      void agent
        .run(task, { onEvent: handleEvent, approveToolCall }, history)
        .catch((error: unknown) => append({ kind: 'error', title: 'Error', body: errorMessage(error) }))
        .finally(() => { setRunning(false); setStreamingText(''); abortRef.current = null; });
    },
    [addSessionMessages, agent, append, approveToolCall, handleEvent, handleSlashCommand, inputHistory, running, session.messages, wizard],
  );

  useInput((input, key) => {
    // Ctrl+C during run = interrupt, else exit
    if (key.ctrl && input === 'c') {
      if (running) {
        // Cannot truly cancel a running promise, but we signal it
        append({ kind: 'system', title: 'Interrupted', body: 'Attempting to stop current operation…' });
        setRunning(false);
        setStreamingText('');
        return;
      }
      exit();
      return;
    }
    if (key.escape && !running) exit();
    if (approval || running) return;
    if (key.tab) {
      const completed = completeSlashCommand(prompt);
      if (completed) setPrompt(completed);
    }
    // Input history: up/down arrows
    if (key.upArrow && inputHistory.length > 0) {
      const newIndex = historyIndex < 0 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setPrompt(inputHistory[newIndex] ?? '');
    }
    if (key.downArrow && historyIndex >= 0) {
      const newIndex = historyIndex + 1;
      if (newIndex >= inputHistory.length) {
        setHistoryIndex(-1);
        setPrompt('');
      } else {
        setHistoryIndex(newIndex);
        setPrompt(inputHistory[newIndex] ?? '');
      }
    }
  });

  const approvalItems = approval
    ? [
        { label: 'Approve once', value: 'approve' as const },
        { label: 'Always approve this session', value: 'always' as const },
        { label: 'Deny', value: 'deny' as const },
      ]
    : [];
  const suggestions = slashCommandSuggestions(prompt);

  // Compact context bar for status line
  const contextBar = formatContextStats(session.messages);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" minHeight={20}>
        {messages.slice(-30).map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
        {streamingText ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text color="cyan" bold>✻ MiMo</Text>
            <Text>{renderMarkdown(streamingText)}</Text>
          </Box>
        ) : null}
        {running && !approval && !streamingText ? (
          <Text color="yellow">
            <Spinner type="dots" /> {mode === 'plan' ? 'Analyzing…' : 'Thinking…'}
          </Text>
        ) : null}
      </Box>
      {approval ? (
        <Box flexDirection="column" paddingX={1}>
          <Text color="yellow">╭─ Approve tool: {approval.tool.name}</Text>
          <Text color="yellow">│ {summarizeToolInput(approval.toolCall.input, 500)}</Text>
          <Text color="yellow">╰─</Text>
          <SelectInput
            items={approvalItems}
            onSelect={(item) => {
              if (item.value === 'always') {
                alwaysApproveRef.current = true;
                setAlwaysApprove(true);
              }
              approval.resolve(item.value);
              setApproval(undefined);
            }}
          />
        </Box>
      ) : (
        <Box flexDirection="column">
          {suggestions.length > 0 ? (
            <Box flexDirection="column" paddingX={1}>
              {suggestions.map((suggestion) => (
                <Text key={suggestion.name} dimColor>{suggestion.usage.padEnd(36)} {suggestion.description}</Text>
              ))}
            </Box>
          ) : null}
          <Box paddingX={1}>
            <Text color={wizard ? 'yellow' : modeColor(mode)}>╭─{wizard ? wizardPrompt(wizard) : `${modeIcon(mode)} mimo`} </Text>
            <TextInput value={prompt} onChange={setPrompt} onSubmit={submit} placeholder="message MiMo, /help, Tab complete" />
          </Box>
          <Box paddingX={1} justifyContent="space-between">
            <Text color={wizard ? 'yellow' : modeColor(mode)}>╰─ </Text>
            <Text dimColor>{contextBar}{alwaysApprove ? ' · auto-approve' : ''}{options.dryRun ? ' · dry-run' : ''} · {config.model}</Text>
          </Box>
        </Box>
      )}
      {wizard ? <Text color="yellow">{wizard.error ? `Error: ${wizard.error}` : wizard.step === 'review' ? wizardSummary(wizard) : 'back / cancel / save'}</Text> : null}
      <Text dimColor>Enter send · Tab complete · ↑↓ history · Esc quit · Ctrl+C {running ? 'interrupt' : 'quit'} · /help commands</Text>
    </Box>
  );
}

async function handleWizardInput(
  task: string,
  wizard: ConfigWizard,
  setWizard: React.Dispatch<React.SetStateAction<ConfigWizard | undefined>>,
  append: (message: Omit<TuiMessage, 'id'>) => void,
): Promise<void> {
  if (wizard.step === 'review' && task === 'save') {
    const filePath = await saveWizardConfig(wizard);
    setWizard(undefined);
    append({ kind: 'system', title: 'Config saved', body: `${filePath}\nRestart TUI to reload runtime config.` });
    return;
  }
  const nextWizard = updateWizard(wizard, task);
  setWizard(nextWizard.error?.startsWith('Cancelled') ? undefined : nextWizard);
  if (nextWizard.error?.startsWith('Cancelled')) append({ kind: 'system', title: 'Config', body: nextWizard.error });
}

async function loadSession(
  prefix: string | undefined,
  setSession: React.Dispatch<React.SetStateAction<SessionRecord>>,
  append: (message: Omit<TuiMessage, 'id'>) => void,
): Promise<void> {
  if (!prefix) {
    append({ kind: 'error', title: 'Load session', body: 'Usage: /load <session-id-prefix>' });
    return;
  }
  const sessions = await listSessions();
  const match = sessions.find((candidate) => candidate.id.startsWith(prefix));
  if (!match) {
    append({ kind: 'error', title: 'Load session', body: `No session starts with ${prefix}` });
    return;
  }
  const loaded = await readSession(match.id);
  setSession(loaded);
  append({ kind: 'system', title: 'Session loaded', body: `${loaded.title}\n${loaded.id}\nmessages=${loaded.messages.length}` });
}

function formatSessions(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return 'No saved sessions';
  return sessions.map((session) => `${session.id.slice(0, 8)}  ${session.updatedAt}  ${session.title}  (${session.messages.length} messages)`).join('\n');
}

function MessageView({ message }: { message: TuiMessage }): React.ReactElement {
  const color = colorForKind(message.kind);
  const prefix = prefixForKind(message.kind);
  const ts = message.timestamp ? ` ${message.timestamp}` : '';
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>{prefix} {message.title}<Text dimColor>{ts}</Text></Text>
      <Text>{message.body}<Newline /></Text>
    </Box>
  );
}

function colorForKind(kind: TuiMessage['kind']): 'gray' | 'green' | 'cyan' | 'yellow' | 'red' | 'blue' | 'magenta' {
  if (kind === 'system') return 'gray';
  if (kind === 'user') return 'green';
  if (kind === 'assistant') return 'cyan';
  if (kind === 'tool') return 'yellow';
  if (kind === 'thinking') return 'gray';
  if (kind === 'diff') return 'magenta';
  return 'red';
}

function prefixForKind(kind: TuiMessage['kind']): string {
  if (kind === 'user') return '>';
  if (kind === 'assistant') return '✻';
  if (kind === 'tool') return '⏺';
  if (kind === 'error') return '✖';
  if (kind === 'thinking') return '💭';
  if (kind === 'diff') return '±';
  return '•';
}

function modeColor(mode: InteractionMode): 'cyan' | 'blue' | 'red' {
  if (mode === 'plan') return 'blue';
  if (mode === 'yolo') return 'red';
  return 'cyan';
}

function modeIcon(mode: InteractionMode): string {
  if (mode === 'plan') return '🔍';
  if (mode === 'yolo') return '⚡';
  return '🤖';
}
