import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, render, Text, useApp, useInput, useStdin } from 'ink';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { MimoTextInput } from './text-input.js';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { CodingAgent } from '../agent/agent.js';
import { discoverNamedSubagents } from '../agent/named-subagents.js';
import { compactMessages, formatContextStats } from '../context/compaction.js';
import { discoverSkills } from '../skills/discover.js';
import { initProject } from '../config/init.js';
import { runDiagnostics, formatDiagnostics } from '../doctor/checks.js';
import { addMemoryNote, listMemoryNotes } from '../memory/store.js';
import { createConfigWizardState, saveWizardConfig, updateWizard, wizardPrompt, wizardSummary } from '../config/tui-wizard.js';
import { createSession, listSessions, readSession, saveSession, exportSession } from '../session/store.js';
import { getTodoStore } from '../tools/todo.js';
import { formatNetworkPolicy, allowHost, denyHost, resetNetworkPolicy } from '../policy/network.js';
import { describeSandbox, defaultSandboxForMode } from '../policy/sandbox.js';
import { renderMarkdown } from './markdown.js';
import { appendInputHistory, loadInputHistory } from './history.js';
import { TranscriptEntry, type TranscriptKind, type TranscriptMessage } from './transcript.js';
import { isLikelyDiff } from './diff.js';
import { ThinkingBuffer } from './thinking-buffer.js';
import { formatUsage, formatCost } from '../agent/usage.js';
import type {
  AgentEvent,
  AgentOptions,
  ChatMessage,
  CostEstimate,
  InteractionMode,
  RuntimeConfig,
  SandboxLevel,
  SessionRecord,
  ToolApprovalDecision,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from '../types.js';
import { errorMessage } from '../utils/errors.js';
import {
  completeSlashCommand,
  parseSlashCommand,
  slashCommandSuggestions,
  SLASH_COMMAND_HELP,
} from './commands.js';
import { summarizeToolInput, summarizeToolOutput, formatTimestamp, formatDuration } from './format.js';
import { SPLASH, statusLine, modeIndicator, MODE_LABELS, shortenPath, verbForTool } from './theme.js';
// keep statusLine/modeIndicator imports — used by /status and /mode handlers below.

interface PendingApproval {
  toolCall: ToolCall;
  tool: ToolDefinition;
  resolve(decision: ToolApprovalDecision): void;
}

const KEYBOARD_SHORTCUTS = [
  'Enter            Send the current message',
  '\\ then Enter     Continue the message on a new line',
  '↑ / ↓            Navigate input history',
  '← / →            Move cursor within the input',
  '⌫ / DEL          Delete left of / right of cursor',
  'Home / Ctrl+A    Jump to start of line',
  'End  / Ctrl+E    Jump to end of line',
  'Tab              Cycle slash-command completions',
  'Ctrl+L           Clear the transcript',
  'Ctrl+U           Reset the current input',
  'Ctrl+W           Delete the previous word',
  'Ctrl+K           Kill to end of line',
  'Ctrl+C           Interrupt run · press again to quit',
  'Esc              Deny pending approval / clear pending lines / quit when idle',
].join('\n');

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
  const { setRawMode } = useStdin();
  const [messages, setMessages] = useState<TranscriptMessage[]>(() => [
    {
      id: 1,
      kind: 'splash',
      title: '',
      body: SPLASH,
      timestamp: undefined,
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [pendingLines, setPendingLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | undefined>();
  const [usage, setUsage] = useState<TokenUsage>({});
  const [sessionCost, setSessionCost] = useState<CostEstimate | undefined>();
  const [alwaysApprove, setAlwaysApprove] = useState(options.autoApprove);
  const [session, setSession] = useState<SessionRecord>(() => createSession('Untitled session', options.cwd));
  const [wizard, setWizard] = useState<ConfigWizard | undefined>();
  const [mode, setMode] = useState<InteractionMode>(options.mode ?? 'agent');
  const [sandbox, setSandbox] = useState<SandboxLevel>(options.sandbox ?? defaultSandboxForMode(options.mode ?? 'agent'));
  const [streamingText, setStreamingText] = useState('');
  const [streamingThinking, setStreamingThinking] = useState('');
  const [activeTool, setActiveTool] = useState<{ name: string; startedAt: number } | undefined>();
  const [now, setNow] = useState<number>(() => Date.now());
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputKey, setInputKey] = useState(0);
  const [tabCycle, setTabCycle] = useState(0);
  const [branch, setBranch] = useState<string | undefined>(() => detectBranch(options.cwd));
  const alwaysApproveRef = useRef(options.autoApprove);
  const abortRef = useRef<AbortController | null>(null);
  const toolStartTimes = useRef<Map<string, number>>(new Map());
  const indexCounter = useRef(0);
  const thinkingBufferRef = useRef(new ThinkingBuffer());
  const streamingBufferRef = useRef('');
  const agent = new CodingAgent(config, tools, { ...options, sandbox });

  // Load persistent input history once.
  useEffect(() => {
    void loadInputHistory().then((entries) => {
      setInputHistory(entries);
    });
  }, []);

  // Tick the wall clock every second so the verb-phase spinner ("Reading… 12s")
  // stays accurate while a tool is in flight.
  useEffect(() => {
    if (!activeTool && !running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [activeTool, running]);

  const append = useCallback((message: Omit<TranscriptMessage, 'id'>) => {
    setMessages((prev) => {
      const idx = ['tool_call', 'tool_result', 'diff'].includes(message.kind) ? ++indexCounter.current : undefined;
      const next: TranscriptMessage = { ...message, id: Date.now() + Math.random(), index: idx };
      return [...prev, next].slice(-200);
    });
  }, []);

  const addSessionMessages = useCallback((newMessages: ChatMessage[]) => {
    setSession((current) => ({
      ...current,
      messages: [...current.messages, ...newMessages],
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  // Commit any buffered reasoning content as a single transcript entry. Called
  // before any non-thinking event lands (assistant message, tool call, error,
  // done, etc.) so that consecutive `assistant_thinking` deltas always render
  // as one block instead of fragmented panels.
  const flushThinking = useCallback(() => {
    const text = thinkingBufferRef.current.flush();
    setStreamingThinking('');
    if (text) {
      append({ kind: 'thinking', title: 'thinking', body: text, collapsed: true });
    }
  }, [append]);

  const flushStreaming = useCallback(() => {
    streamingBufferRef.current = '';
    setStreamingText('');
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === 'thinking') return;
      if (event.type === 'assistant_thinking') {
        thinkingBufferRef.current.append(event.content);
        setStreamingThinking(thinkingBufferRef.current.peek());
        return;
      }
      if (event.type === 'streaming_delta') {
        // First content delta after a thinking burst commits the thinking
        // block to the transcript so the live "thinking… streaming" panel
        // doesn't sit alongside the live "mimo… streaming" panel.
        if (streamingBufferRef.current === '' && !thinkingBufferRef.current.isEmpty()) {
          flushThinking();
        }
        streamingBufferRef.current += event.content;
        setStreamingText(streamingBufferRef.current);
        return;
      }
      if (event.type === 'assistant_message') {
        flushThinking();
        flushStreaming();
        append({ kind: 'assistant', title: 'mimo', body: renderMarkdown(event.content), timestamp: formatTimestamp() });
        addSessionMessages([{ role: 'assistant', content: event.content }]);
        return;
      }
      if (event.type === 'tool_call') {
        flushThinking();
        flushStreaming();
        toolStartTimes.current.set(event.id, Date.now());
        setActiveTool({ name: event.name, startedAt: Date.now() });
        append({ kind: 'tool_call', title: `${event.name}`, body: summarizeToolInput(event.input), timestamp: formatTimestamp() });
        return;
      }
      if (event.type === 'tool_result') {
        const startTime = toolStartTimes.current.get(event.id);
        const durationMs = startTime ? Date.now() - startTime : undefined;
        toolStartTimes.current.delete(event.id);
        setActiveTool(undefined);
        const isDiff = isLikelyDiff(event.content);
        append({
          kind: isDiff ? 'diff' : 'tool_result',
          title: `${event.name}`,
          body: isDiff ? event.content : summarizeToolOutput(event.content),
          collapsed: !isDiff,
          timestamp: formatTimestamp(),
          ...(durationMs !== undefined ? { durationMs } : {}),
        });
        return;
      }
      if (event.type === 'error') {
        flushThinking();
        flushStreaming();
        append({ kind: 'error', title: 'error', body: event.message, timestamp: formatTimestamp() });
        return;
      }
      if (event.type === 'done') {
        flushThinking();
        flushStreaming();
        setUsage(event.result.usage);
        if (event.result.cost) setSessionCost(event.result.cost);
        // Cost lives in the persistent bottom usage bar — don't repeat it
        // beneath every turn. We also drop the per-turn 'done' notice for
        // single-iteration runs to keep the transcript Codex-clean.
        if (event.result.iterations > 1) {
          append({ kind: 'system', title: 'done', body: `${event.result.iterations} iterations`, timestamp: formatTimestamp() });
        }
      }
    },
    [addSessionMessages, append, flushStreaming, flushThinking],
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

      if (command.name === 'help') append({ kind: 'system', title: 'help', body: SLASH_COMMAND_HELP, timestamp: formatTimestamp() });
      if (command.name === 'keys') append({ kind: 'system', title: 'shortcuts', body: KEYBOARD_SHORTCUTS, timestamp: formatTimestamp() });
      if (command.name === 'exit') exit();
      if (command.name === 'clear') {
        setMessages([{ id: Date.now(), kind: 'splash', title: '', body: SPLASH }]);
      }
      if (command.name === 'config') {
        void createConfigWizardState().then(setWizard).catch((error: unknown) => append({ kind: 'error', title: 'config', body: errorMessage(error) }));
      }
      if (command.name === 'init') {
        void initProject(options.cwd, { model: config.model, baseUrl: config.baseUrl })
          .then((result) => {
            const lines = [
              `Initialized project at ${options.cwd}`,
              ...result.created.map((file) => `  + ${path.relative(options.cwd, file) || file}`),
              ...(result.alreadyExisted.length > 0 ? ['', 'Already present (left untouched):', ...result.alreadyExisted.map((file) => `  · ${path.relative(options.cwd, file) || file}`)] : []),
            ];
            append({ kind: 'system', title: 'init', body: lines.join('\n'), timestamp: formatTimestamp() });
          })
          .catch((error: unknown) => append({ kind: 'error', title: 'init', body: errorMessage(error) }));
      }
      if (command.name === 'new') {
        const title = command.args.join(' ') || 'Untitled session';
        setSession(createSession(title, options.cwd));
        setMessages([]);
        append({ kind: 'system', title: 'session', body: `Started new session: ${title}`, timestamp: formatTimestamp() });
      }
      if (command.name === 'save') {
        void saveSession(session)
          .then((filePath) => append({ kind: 'system', title: 'session saved', body: filePath, timestamp: formatTimestamp() }))
          .catch((error: unknown) => append({ kind: 'error', title: 'save', body: errorMessage(error) }));
      }
      if (command.name === 'sessions') {
        void listSessions()
          .then((sessions) => append({ kind: 'system', title: 'sessions', body: formatSessions(sessions), timestamp: formatTimestamp() }))
          .catch((error: unknown) => append({ kind: 'error', title: 'sessions', body: errorMessage(error) }));
      }
      if (command.name === 'load') void doLoadSession(command.args[0], setSession, append);
      if (command.name === 'resume') void doResumeSession(setSession, append);
      if (command.name === 'mcp') append({ kind: 'system', title: 'mcp servers', body: JSON.stringify(config.mcpServers ?? [], null, 2), timestamp: formatTimestamp() });
      if (command.name === 'skill') append({ kind: 'system', title: 'skills (config)', body: JSON.stringify(config.skills ?? [], null, 2), timestamp: formatTimestamp() });
      if (command.name === 'skills') {
        void discoverSkills(options.cwd)
          .then((skills) => {
            if (skills.length === 0) {
              append({ kind: 'system', title: 'skills', body: 'No skill files found in .mimo/skills or ~/.mimo-code/skills.\nRun /init to scaffold a sample skill.', timestamp: formatTimestamp() });
              return;
            }
            const body = skills
              .map((skill) => `[${skill.scope}] ${skill.name}${skill.description ? ` — ${skill.description}` : ''}\n  triggers: ${skill.triggers.join(', ') || '(manual)'}\n  ${skill.filePath}`)
              .join('\n\n');
            append({ kind: 'system', title: 'skills', body, timestamp: formatTimestamp() });
          })
          .catch((error: unknown) => append({ kind: 'error', title: 'skills', body: errorMessage(error) }));
      }
      if (command.name === 'agents') {
        void discoverNamedSubagents(options.cwd)
          .then((agents) => {
            if (agents.length === 0) {
              append({ kind: 'system', title: 'agents', body: 'No named subagents found in .mimo/agents/. Run /init to scaffold one.', timestamp: formatTimestamp() });
              return;
            }
            const body = agents
              .map((named) => `[${named.scope}] ${named.name}${named.description ? ` — ${named.description}` : ''}\n  tools: ${named.tools?.join(', ') ?? '(inherits all)'}\n  ${named.filePath}`)
              .join('\n\n');
            append({ kind: 'system', title: 'named agents', body, timestamp: formatTimestamp() });
          })
          .catch((error: unknown) => append({ kind: 'error', title: 'agents', body: errorMessage(error) }));
      }
      if (command.name === 'sandbox') {
        const target = command.args[0];
        if (target === 'read-only' || target === 'workspace-write' || target === 'danger-full-access') {
          setSandbox(target);
          append({ kind: 'system', title: 'sandbox', body: `Set sandbox: ${describeSandbox(target)}`, timestamp: formatTimestamp() });
        } else {
          append({ kind: 'system', title: 'sandbox', body: `Current: ${describeSandbox(sandbox)}\nUsage: /sandbox [read-only|workspace-write|danger-full-access]`, timestamp: formatTimestamp() });
        }
      }
      if (command.name === 'hooks') append({ kind: 'system', title: 'hooks', body: JSON.stringify(config.hooks ?? [], null, 2), timestamp: formatTimestamp() });
      if (command.name === 'tools') {
        const toolLines = tools.map((tool) => {
          const readOnlyTag = tool.readOnly ? ' (read-only)' : '';
          return `  ${tool.name}${readOnlyTag} — ${tool.description}`;
        });
        append({ kind: 'system', title: `tools (${tools.length})`, body: toolLines.join('\n'), timestamp: formatTimestamp() });
      }
      if (command.name === 'status') append({ kind: 'system', title: 'status', body: statusLine(config, session, tools, usage, options.cwd, mode, sessionCost), timestamp: formatTimestamp() });

      if (command.name === 'mode') {
        const target = command.args[0];
        if (target === 'plan' || target === 'agent' || target === 'yolo') {
          setMode(target);
          setSandbox(defaultSandboxForMode(target));
          if (target === 'yolo') alwaysApproveRef.current = true;
          append({ kind: 'system', title: 'mode', body: `Switched to ${modeIndicator(target)}`, timestamp: formatTimestamp() });
        } else {
          append({ kind: 'system', title: 'mode', body: `Current: ${modeIndicator(mode)}\nUsage: /mode [plan|agent|yolo]`, timestamp: formatTimestamp() });
        }
      }
      if (command.name === 'compact') {
        setSession((current) => {
          const compacted = compactMessages(current.messages);
          append({ kind: 'system', title: 'compact', body: `Compacted ${current.messages.length} → ${compacted.length} messages`, timestamp: formatTimestamp() });
          return { ...current, messages: compacted, updatedAt: new Date().toISOString() };
        });
      }
      if (command.name === 'diff') {
        try {
          const diff = execSync('git diff --stat --patch', { cwd: options.cwd, encoding: 'utf8', timeout: 10_000 });
          append({ kind: 'diff', title: 'workspace diff', body: diff || 'No changes detected', timestamp: formatTimestamp() });
        } catch {
          append({ kind: 'error', title: 'diff', body: 'Not a git repository or git not available', timestamp: formatTimestamp() });
        }
      }
      if (command.name === 'doctor') {
        void runDiagnostics(config, options.cwd)
          .then((results) => append({ kind: 'system', title: 'diagnostics', body: formatDiagnostics(results), timestamp: formatTimestamp() }))
          .catch((error: unknown) => append({ kind: 'error', title: 'doctor', body: errorMessage(error) }));
      }
      if (command.name === 'memory') {
        const note = command.args.join(' ');
        if (note) {
          void addMemoryNote(note, options.cwd)
            .then((mem) => append({ kind: 'system', title: 'memory', body: `Saved note ${mem.id}: ${note}`, timestamp: formatTimestamp() }))
            .catch((error: unknown) => append({ kind: 'error', title: 'memory', body: errorMessage(error) }));
        } else {
          void listMemoryNotes(options.cwd)
            .then((notes) => {
              if (notes.length === 0) append({ kind: 'system', title: 'memory', body: 'No memory notes. Usage: /memory <note text>', timestamp: formatTimestamp() });
              else append({ kind: 'system', title: 'memory', body: notes.map((n) => `${n.id} [${n.scope}] ${n.content}`).join('\n'), timestamp: formatTimestamp() });
            })
            .catch((error: unknown) => append({ kind: 'error', title: 'memory', body: errorMessage(error) }));
        }
      }
      if (command.name === 'undo') {
        try {
          const result = execSync('git checkout -- .', { cwd: options.cwd, encoding: 'utf8', timeout: 10_000 });
          append({ kind: 'system', title: 'undo', body: result || 'Reverted all unstaged changes', timestamp: formatTimestamp() });
        } catch {
          append({ kind: 'error', title: 'undo', body: 'Failed to revert. Not a git repository or no changes to undo.', timestamp: formatTimestamp() });
        }
      }
      if (command.name === 'expand') doExpand(command.args[0], setMessages, append);
      if (command.name === 'collapse') doCollapse(command.args[0], setMessages, append);
      if (command.name === 'bug') {
        const desc = command.args.join(' ');
        if (desc) append({ kind: 'system', title: 'bug', body: `Bug recorded: ${desc}\nReport at: https://github.com/KoinaAI/MiMo-CLI/issues`, timestamp: formatTimestamp() });
        else append({ kind: 'error', title: 'bug', body: 'Usage: /bug <description>', timestamp: formatTimestamp() });
      }
      if (command.name === 'context') append({ kind: 'system', title: 'context', body: formatContextStats(session.messages), timestamp: formatTimestamp() });
      if (command.name === 'cost') {
        const costStr = formatCost(sessionCost);
        append({ kind: 'system', title: 'session cost', body: costStr || 'No cost data yet', timestamp: formatTimestamp() });
      }
      if (command.name === 'todo') {
        const todos = getTodoStore();
        if (todos.length === 0) append({ kind: 'system', title: 'todo', body: 'No tasks in checklist. The agent can use todo_add to track tasks.', timestamp: formatTimestamp() });
        else {
          const statusIcon = (status: string) => (status === 'done' ? '[x]' : status === 'in_progress' ? '[~]' : '[ ]');
          append({ kind: 'system', title: 'todo', body: todos.map((t) => `#${t.id} ${statusIcon(t.status)} ${t.text}`).join('\n'), timestamp: formatTimestamp() });
        }
      }
      if (command.name === 'network') {
        const subCmd = command.args[0];
        const host = command.args[1];
        if (subCmd === 'allow' && host) { allowHost(host); append({ kind: 'system', title: 'network', body: `Allowed: ${host}`, timestamp: formatTimestamp() }); }
        else if (subCmd === 'deny' && host) { denyHost(host); append({ kind: 'system', title: 'network', body: `Denied: ${host}`, timestamp: formatTimestamp() }); }
        else if (subCmd === 'reset') { resetNetworkPolicy(); append({ kind: 'system', title: 'network', body: 'Policy reset to default (allow all)', timestamp: formatTimestamp() }); }
        else append({ kind: 'system', title: 'network policy', body: formatNetworkPolicy(), timestamp: formatTimestamp() });
      }
      if (command.name === 'export') {
        const outputPath = command.args[0];
        if (!outputPath) append({ kind: 'error', title: 'export', body: 'Usage: /export <file-path>', timestamp: formatTimestamp() });
        else {
          void exportSession(session.id, outputPath)
            .then((filePath) => append({ kind: 'system', title: 'exported', body: `Session exported to ${filePath}`, timestamp: formatTimestamp() }))
            .catch((error: unknown) => append({ kind: 'error', title: 'export', body: errorMessage(error) }));
        }
      }

      return true;
    },
    [append, config, exit, mode, options.cwd, sandbox, session, sessionCost, tools, usage],
  );

  const submit = useCallback(
    (value: string) => {
      const raw = value;
      // Multi-line continuation: if the line ends with a backslash, queue it
      // and keep the input open for more text. Otherwise concatenate and submit.
      if (raw.endsWith('\\')) {
        setPendingLines((prev) => [...prev, raw.slice(0, -1)]);
        setPrompt('');
        return;
      }
      const buffered = [...pendingLines, raw].join('\n');
      const task = buffered.trim();
      setPendingLines([]);
      if (!task || running) {
        setPrompt('');
        return;
      }
      setPrompt('');
      if (task && !task.startsWith('/')) {
        setInputHistory((prev) => (prev[prev.length - 1] === task ? prev : [...prev, task]));
        void appendInputHistory(task);
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
      append({ kind: 'user', title: 'you', body: task, timestamp: formatTimestamp() });
      const userMessage: ChatMessage = { role: 'user', content: task };
      const history = [...session.messages];
      addSessionMessages([userMessage]);
      void agent
        .run(task, { onEvent: handleEvent, approveToolCall }, history)
        .catch((error: unknown) => append({ kind: 'error', title: 'error', body: errorMessage(error), timestamp: formatTimestamp() }))
        .finally(() => {
          setRunning(false);
          setStreamingText('');
          abortRef.current = null;
        });
    },
    [addSessionMessages, agent, append, approveToolCall, handleEvent, handleSlashCommand, pendingLines, running, session.messages, wizard],
  );

  // Replace the prompt programmatically and remount the inner text input so
  // the cursor lands at the end of the new value (instead of being stranded
  // mid-string from a previous, unrelated cursor offset). Also resets history
  // navigation state so subsequent typing creates a fresh entry.
  const replacePrompt = useCallback((next: string) => {
    setPrompt(next);
    setInputKey((k) => k + 1);
  }, []);

  useInput((input, key) => {
    // Ctrl+C: interrupt run, else exit.
    if (key.ctrl && input === 'c') {
      if (running) {
        append({ kind: 'system', title: 'interrupted', body: 'Stopping current run.', timestamp: formatTimestamp() });
        setRunning(false);
        flushStreaming();
        return;
      }
      try { setRawMode(false); } catch { /* ignore */ }
      exit();
      return;
    }
    // Esc: cancel approval (== deny). Otherwise clear pending lines, then exit when idle.
    if (key.escape) {
      if (approval) {
        approval.resolve('deny');
        setApproval(undefined);
        return;
      }
      if (pendingLines.length > 0) {
        setPendingLines([]);
        return;
      }
      if (!running && !prompt) {
        try { setRawMode(false); } catch { /* ignore */ }
        exit();
      }
      return;
    }
    if (approval || running) return;
    // Ctrl+L: clear screen (== /clear).
    if (key.ctrl && input === 'l') {
      setMessages([{ id: Date.now(), kind: 'splash', title: '', body: SPLASH }]);
      return;
    }
    // Ctrl+U: clear current input.
    if (key.ctrl && input === 'u') {
      replacePrompt('');
      setPendingLines([]);
      setHistoryIndex(-1);
      return;
    }
    // Ctrl+W: delete previous word from current input.
    if (key.ctrl && input === 'w') {
      replacePrompt(deletePreviousWord(prompt));
      return;
    }
    // Tab: cycle through completions when there are multiple.
    if (key.tab) {
      const completed = completeSlashCommand(prompt, tabCycle);
      if (completed) {
        replacePrompt(completed);
        setTabCycle((cycle) => cycle + 1);
      }
      return;
    }
    if (key.upArrow) {
      if (inputHistory.length === 0) return;
      const newIndex = historyIndex < 0 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      replacePrompt(inputHistory[newIndex] ?? '');
      return;
    }
    if (key.downArrow) {
      if (historyIndex < 0) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= inputHistory.length) {
        setHistoryIndex(-1);
        replacePrompt('');
      } else {
        setHistoryIndex(newIndex);
        replacePrompt(inputHistory[newIndex] ?? '');
      }
      return;
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
  const contextBar = formatContextStats(session.messages);
  const inputHint = pendingLines.length > 0 ? ` (line ${pendingLines.length + 1})` : '';
  const verb = activeTool ? `${verbForTool(activeTool.name)} ${activeTool.name}…` : mode === 'plan' ? 'Analyzing…' : 'Thinking…';
  const elapsed = activeTool ? formatDuration(now - activeTool.startedAt) : undefined;
  const usageSummary = formatUsage(usage);
  const costSummary = formatCost(sessionCost);
  const handlePromptChange = useCallback(
    (value: string) => {
      setPrompt(value);
      if (historyIndex !== -1) setHistoryIndex(-1);
      if (tabCycle !== 0) setTabCycle(0);
    },
    [historyIndex, tabCycle],
  );

  // Refresh branch indicator when something might have changed (lazy: every input cycle).
  if (branch === undefined) setBranch(detectBranch(options.cwd));

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" minHeight={20} paddingX={1}>
        {messages.slice(-50).map((message) => (
          <TranscriptEntry key={message.id} message={message} />
        ))}
        {streamingThinking ? (
          <Box flexDirection="column">
            <Text color="gray" bold>▎ thinking <Text dimColor>· streaming</Text></Text>
            <Text dimColor>{streamingThinking}</Text>
          </Box>
        ) : null}
        {streamingText ? (
          <Box flexDirection="column">
            <Text color="cyan" bold>▎ mimo <Text dimColor>· streaming</Text></Text>
            <Text>{renderMarkdown(streamingText)}</Text>
          </Box>
        ) : null}
        {running && !approval && !streamingText && !streamingThinking ? (
          <Text color="yellow">
            <Spinner type="dots" /> {verb}{elapsed ? ` ${elapsed}` : ''}
          </Text>
        ) : null}
      </Box>
      {approval ? (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow" bold>Approve tool: {approval.tool.name}</Text>
          <Text color="yellow">{summarizeToolInput(approval.toolCall.input, 500)}</Text>
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
                <Text key={suggestion.name} dimColor>{suggestion.usage.padEnd(40)} {suggestion.description}</Text>
              ))}
            </Box>
          ) : null}
          {pendingLines.length > 0 ? (
            <Box flexDirection="column" paddingX={1}>
              {pendingLines.map((line, idx) => (
                <Text key={idx} dimColor>… {line}</Text>
              ))}
            </Box>
          ) : null}
          <Box borderStyle="round" borderColor={wizard ? 'yellow' : modeBorderColor(mode)} paddingX={1}>
            <Text color={wizard ? 'yellow' : modeBorderColor(mode)}>{wizard ? wizardPrompt(wizard) : `▎ ${mode}${inputHint}`} </Text>
            <MimoTextInput
              key={inputKey}
              value={prompt}
              onChange={handlePromptChange}
              onSubmit={submit}
              placeholder="message MiMo · / for commands · /keys for shortcuts · \\ for newline"
            />
          </Box>
          <BottomStatusBar
            config={config}
            cwd={options.cwd}
            mode={mode}
            branch={branch}
            sandbox={sandbox}
            contextBar={contextBar}
            usageSummary={usageSummary}
            costSummary={costSummary}
            alwaysApprove={alwaysApprove}
            dryRun={options.dryRun}
          />
        </Box>
      )}
      {wizard ? <Text color="yellow">{wizard.error ? `Error: ${wizard.error}` : wizard.step === 'review' ? wizardSummary(wizard) : 'back / cancel / save'}</Text> : null}
    </Box>
  );
}

interface BottomStatusBarProps {
  config: RuntimeConfig;
  cwd: string;
  mode: InteractionMode;
  branch: string | undefined;
  sandbox: SandboxLevel;
  contextBar: string;
  usageSummary: string;
  costSummary: string;
  alwaysApprove: boolean;
  dryRun: boolean | undefined;
}

/**
 * Codex-style persistent status row, rendered directly under the input frame.
 * Shows the active mode, model, sandbox, cwd, git branch, context utilization,
 * token totals, and accumulated cost. We deliberately keep this on a single
 * dim line so the transcript above it stays the visual focus.
 */
function BottomStatusBar(props: BottomStatusBarProps): React.ReactElement {
  const { config, cwd, mode, branch, sandbox, contextBar, usageSummary, costSummary, alwaysApprove, dryRun } = props;
  const segments = [MODE_LABELS[mode], config.model, describeSandbox(sandbox)];
  if (alwaysApprove) segments.push('auto-approve');
  if (dryRun) segments.push('dry-run');
  segments.push(shortenPath(cwd));
  if (branch) segments.push(`⎇ ${branch}`);
  if (contextBar) segments.push(contextBar);
  if (usageSummary) segments.push(usageSummary);
  if (costSummary) segments.push(costSummary);
  return (
    <Box paddingX={1}>
      <Text dimColor>{segments.join(' · ')}</Text>
    </Box>
  );
}

function modeBorderColor(mode: InteractionMode): 'cyan' | 'blue' | 'red' {
  if (mode === 'plan') return 'blue';
  if (mode === 'yolo') return 'red';
  return 'cyan';
}

function deletePreviousWord(input: string): string {
  if (!input) return input;
  const trimmed = input.replace(/\s+$/, '');
  const idx = trimmed.search(/\s\S*$/);
  if (idx === -1) return '';
  return input.slice(0, idx + 1);
}

function detectBranch(cwd: string): string | undefined {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8', timeout: 1500 }).trim();
    return branch || undefined;
  } catch {
    return undefined;
  }
}

async function handleWizardInput(
  task: string,
  wizard: ConfigWizard,
  setWizard: React.Dispatch<React.SetStateAction<ConfigWizard | undefined>>,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
): Promise<void> {
  if (wizard.step === 'review' && task === 'save') {
    const filePath = await saveWizardConfig(wizard);
    setWizard(undefined);
    append({ kind: 'system', title: 'config saved', body: `${filePath}\nRestart TUI to reload runtime config.`, timestamp: formatTimestamp() });
    return;
  }
  const nextWizard = updateWizard(wizard, task);
  setWizard(nextWizard.error?.startsWith('Cancelled') ? undefined : nextWizard);
  if (nextWizard.error?.startsWith('Cancelled')) append({ kind: 'system', title: 'config', body: nextWizard.error, timestamp: formatTimestamp() });
}

async function doLoadSession(
  prefix: string | undefined,
  setSession: React.Dispatch<React.SetStateAction<SessionRecord>>,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
): Promise<void> {
  if (!prefix) {
    append({ kind: 'error', title: 'load session', body: 'Usage: /load <session-id-prefix>', timestamp: formatTimestamp() });
    return;
  }
  const sessions = await listSessions();
  const match = sessions.find((candidate) => candidate.id.startsWith(prefix));
  if (!match) {
    append({ kind: 'error', title: 'load session', body: `No session starts with ${prefix}`, timestamp: formatTimestamp() });
    return;
  }
  const loaded = await readSession(match.id);
  setSession(loaded);
  append({ kind: 'system', title: 'session loaded', body: `${loaded.title}\n${loaded.id}\nmessages=${loaded.messages.length}`, timestamp: formatTimestamp() });
}

async function doResumeSession(
  setSession: React.Dispatch<React.SetStateAction<SessionRecord>>,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
): Promise<void> {
  try {
    const sessions = await listSessions();
    if (sessions.length === 0) {
      append({ kind: 'system', title: 'resume', body: 'No saved sessions to resume.', timestamp: formatTimestamp() });
      return;
    }
    const latest = sessions[0];
    if (!latest) return;
    setSession(latest);
    append({ kind: 'system', title: 'resumed', body: `${latest.title}\n${latest.id}\nmessages=${latest.messages.length}`, timestamp: formatTimestamp() });
  } catch (error) {
    append({ kind: 'error', title: 'resume', body: errorMessage(error), timestamp: formatTimestamp() });
  }
}

function doExpand(
  arg: string | undefined,
  setMessages: React.Dispatch<React.SetStateAction<TranscriptMessage[]>>,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
): void {
  setMessages((prev) => updateCollapse(prev, arg, false));
  if (!arg) append({ kind: 'system', title: 'expand', body: 'Usage: /expand <#index|all>', timestamp: formatTimestamp() });
}

function doCollapse(
  arg: string | undefined,
  setMessages: React.Dispatch<React.SetStateAction<TranscriptMessage[]>>,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
): void {
  setMessages((prev) => updateCollapse(prev, arg, true));
  if (!arg) append({ kind: 'system', title: 'collapse', body: 'Usage: /collapse <#index|all>', timestamp: formatTimestamp() });
}

function updateCollapse(messages: TranscriptMessage[], arg: string | undefined, collapsed: boolean): TranscriptMessage[] {
  if (!arg) return messages;
  if (arg === 'all') return messages.map((message) => (message.index !== undefined ? { ...message, collapsed } : message));
  const index = Number(arg.replace(/^#/, ''));
  if (Number.isNaN(index)) return messages;
  return messages.map((message) => (message.index === index ? { ...message, collapsed } : message));
}

function formatSessions(sessions: SessionRecord[]): string {
  if (sessions.length === 0) return 'No saved sessions';
  return sessions
    .map((s) => `${s.id.slice(0, 8)}  ${s.updatedAt}  ${s.title}  (${s.messages.length} messages)`)
    .join('\n');
}

const _appendKinds: TranscriptKind[] = ['system', 'user', 'assistant', 'tool_call', 'tool_result', 'thinking', 'diff', 'error', 'splash'];
void _appendKinds;
