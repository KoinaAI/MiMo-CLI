import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, render, Text, useApp, useInput, useStdin } from 'ink';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { MimoTextInput } from './text-input.js';
import { execFileSync, execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findMentionAt, applyMention, suggestMentions, expandMentions } from './mentions.js';
import { composeInEditor } from './editor.js';
import { CodingAgent } from '../agent/agent.js';
import { discoverNamedSubagents } from '../agent/named-subagents.js';
import { compactMessages, formatContextStats } from '../context/compaction.js';
import { discoverSkills } from '../skills/discover.js';
import { describeHookConfig } from '../hooks.js';
import { initProject } from '../config/init.js';
import { runDiagnostics, formatDiagnostics } from '../doctor/checks.js';
import { addMemoryNote, listMemoryNotes } from '../memory/store.js';
import { createConfigWizardState, saveWizardConfig, updateWizard, wizardPrompt, wizardSummary } from '../config/tui-wizard.js';
import { createSession, listSessions, readSession, saveSession, exportSession } from '../session/store.js';
import { getTodoStore } from '../tools/todo.js';
import { getMcpRegistry } from '../mcp/registry.js';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_TEMPERATURE, SUPPORTED_MODELS } from '../constants.js';
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
import { summarizeToolInput, summarizeToolInputCompact, summarizeToolOutput, summarizeToolOutputCompact, formatTimestamp, formatDuration } from './format.js';
import { SPLASH, modeIndicator, shortenPath, verbForTool, formatWorkflowSummary, topStatusLine } from './theme.js';

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
  'Shift+Tab        Cycle Plan / Agent / YOLO mode',
  'Ctrl+L           Clear the transcript',
  'Ctrl+U           Reset the current input',
  'Ctrl+W           Delete the previous word',
  'Ctrl+K           Kill to end of line',
  'Ctrl+C           Interrupt run · press twice to quit',
  'Esc              Deny approval · press twice to edit previous turn',
].join('\n');

interface TuiAppProps {
  config: RuntimeConfig;
  tools: ToolDefinition[];
  options: AgentOptions;
}

type ConfigWizard = Awaited<ReturnType<typeof createConfigWizardState>>;

export async function runTui(config: RuntimeConfig, tools: ToolDefinition[], options: AgentOptions): Promise<void> {
  const instance = render(<TuiApp config={config} tools={tools} options={options} />, { patchConsole: false });
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
  const [cwd, setCwd] = useState(options.cwd);
  const [session, setSession] = useState<SessionRecord>(() => createSession('Untitled session', options.cwd));
  const [wizard, setWizard] = useState<ConfigWizard | undefined>();
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>(config);
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
  const [cursor, setCursor] = useState(0);
  const [cursorOverride, setCursorOverride] = useState<number | undefined>(undefined);
  const [mentionResults, setMentionResults] = useState<string[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [discoveredSkillsCount, setDiscoveredSkillsCount] = useState(0);
  const [namedSubagentsCount, setNamedSubagentsCount] = useState(0);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [editingTurn, setEditingTurn] = useState(false);
  const alwaysApproveRef = useRef(options.autoApprove);
  const abortRef = useRef<AbortController | null>(null);
  const lastCtrlCRef = useRef(0);
  const lastEscRef = useRef(0);
  const lastUserPromptRef = useRef('');
  const runStartRef = useRef('');
  const toolStartTimes = useRef<Map<string, number>>(new Map());
  const indexCounter = useRef(0);
  const thinkingBufferRef = useRef(new ThinkingBuffer());
  const streamingBufferRef = useRef('');
  const agent = new CodingAgent(runtimeConfig, tools, { ...options, cwd, mode, sandbox });

  const mcpToolCount = tools.filter((tool) => tool.name.startsWith('mcp__')).length;
  const builtinToolCount = tools.length - mcpToolCount;
  const enabledMcpServers = runtimeConfig.mcpServers?.filter((server) => server.enabled !== false).length ?? 0;
  const enabledHooks = runtimeConfig.hooks?.filter((hook) => hook.enabled !== false).length ?? 0;
  const enabledConfigSkills = runtimeConfig.skills?.filter((skill) => skill.enabled !== false).length ?? 0;
  const contextBar = formatContextStats(session.messages);

  // Load persistent input history once.
  useEffect(() => {
    void loadInputHistory().then((entries) => {
      setInputHistory(entries);
    });
  }, []);

  const exitWithSessionId = useCallback(() => {
    void saveSession(session).catch(() => undefined);
    try { setRawMode(false); } catch { /* ignore */ }
    console.log(`\nSession ${session.id}`);
    console.log(`Resume with: mimo-code --resume ${session.id.slice(0, 8)}`);
    exit();
  }, [exit, session, setRawMode]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      discoverSkills(cwd).catch(() => []),
      discoverNamedSubagents(cwd).catch(() => []),
    ]).then(([skills, agents]) => {
      if (cancelled) return;
      setDiscoveredSkillsCount(skills.length);
      setNamedSubagentsCount(agents.length);
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  // Tick the wall clock every second so the verb-phase spinner ("Reading… 12s")
  // stays accurate while a tool is in flight.
  useEffect(() => {
    if (!activeTool && !running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [activeTool, running]);

  // Recompute @-mention completions whenever the prompt or caret moves.
  useEffect(() => {
    if (prompt.startsWith('/')) {
      if (mentionResults.length > 0) setMentionResults([]);
      return;
    }
    const ctx = findMentionAt(prompt, cursor);
    if (!ctx) {
      if (mentionResults.length > 0) setMentionResults([]);
      return;
    }
    let cancelled = false;
    void suggestMentions(cwd, ctx.query).then((results) => {
      if (cancelled) return;
      setMentionResults(results);
      setMentionIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [prompt, cursor, cwd, mentionResults.length]);

  const append = useCallback((message: Omit<TranscriptMessage, 'id'>) => {
    setMessages((prev) => {
      const idx = ['tool_call', 'tool_result', 'diff'].includes(message.kind) ? ++indexCounter.current : undefined;
      const next: TranscriptMessage = { ...message, id: Date.now() + Math.random(), index: idx };
      return [...prev, next].slice(-200);
    });
  }, []);

  useEffect(() => {
    const resumeId = options.resumeSessionId;
    if (!resumeId) return;
    void doLoadSession(resumeId, setSession, append, setCwd);
  }, [append, options.resumeSessionId]);

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
      append({ kind: 'thinking', title: 'thinking', body: formatReasoning(text) });
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
        append({ kind: 'assistant', title: 'mimo', body: renderMarkdown(event.content), timestamp: formatTimestamp(), merge: 'append' });
        addSessionMessages([{ role: 'assistant', content: event.content }]);
        return;
      }
      if (event.type === 'tool_call') {
        flushThinking();
        flushStreaming();
        toolStartTimes.current.set(event.id, Date.now());
        setActiveTool({ name: event.name, startedAt: Date.now() });
        append({
          kind: 'tool_call',
          title: verbForTool(event.name),
          summary: `${event.name} ${summarizeToolInputCompact(event.input)}`,
          body: summarizeToolInput(event.input, 500),
          timestamp: formatTimestamp(),
          collapsed: true,
        });
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
          title: event.name,
          summary: isDiff ? undefined : summarizeToolOutputCompact(event.content, 120).split('\n')[0],
          body: isDiff ? event.content : summarizeToolOutput(event.content),
          collapsed: !isDiff,
          timestamp: formatTimestamp(),
          ...(durationMs !== undefined ? { durationMs } : {}),
        });
        return;
      }
      if (event.type === 'hook_result') {
        const status = event.cancelled ? 'blocked' : event.code === 0 ? 'ok' : `exit ${event.code ?? 'unknown'}`;
        append({
          kind: event.cancelled ? 'error' : 'system',
          title: `hook ${event.hook}`,
          body: `[${event.event}] ${status}${event.output ? `\n${event.output}` : ''}`,
          collapsed: !event.cancelled && !event.output,
          timestamp: formatTimestamp(),
        });
        return;
      }
      if (event.type === 'workflow_status') {
        append({ kind: 'system', title: 'workflow ready', body: event.message, timestamp: formatTimestamp(), collapsed: true });
        return;
      }
      if (event.type === 'tool_blocked') {
        append({ kind: 'error', title: `blocked ${event.name}`, body: event.reason, timestamp: formatTimestamp(), collapsed: true });
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

  const switchMode = useCallback((target: InteractionMode) => {
    setMode(target);
    setSandbox(defaultSandboxForMode(target));
    if (target === 'yolo') {
      alwaysApproveRef.current = true;
      setAlwaysApprove(true);
    }
    append({ kind: 'system', title: 'mode', body: `Switched to ${modeIndicator(target)} · sandbox ${describeSandbox(defaultSandboxForMode(target))}`, timestamp: formatTimestamp() });
  }, [append]);

  const switchModel = useCallback((target: string) => {
    setRuntimeConfig((current) => ({ ...current, model: target }));
    append({ kind: 'system', title: 'model', body: `Switched to ${target} for this session.`, timestamp: formatTimestamp() });
  }, [append]);

  const handleSlashCommand = useCallback(
    (value: string): boolean => {
      const command = parseSlashCommand(value);
      if (!command) return false;

      if (command.name === 'help') append({ kind: 'system', title: 'help', body: SLASH_COMMAND_HELP, timestamp: formatTimestamp() });
      if (command.name === 'keys') append({ kind: 'system', title: 'shortcuts', body: KEYBOARD_SHORTCUTS, timestamp: formatTimestamp() });
      if (command.name === 'exit') exitWithSessionId();
      if (command.name === 'clear') {
        setMessages([{ id: Date.now(), kind: 'splash', title: '', body: SPLASH }]);
      }
      if (command.name === 'settings' || command.name === 'config') {
        void createConfigWizardState().then((state) => {
          setWizard(state);
          append({ kind: 'system', title: 'settings', body: formatSettingsMenu(state), timestamp: formatTimestamp() });
        }).catch((error: unknown) => append({ kind: 'error', title: 'settings', body: errorMessage(error) }));
      }
      if (command.name === 'init') {
        void initProject(cwd, { model: runtimeConfig.model, baseUrl: runtimeConfig.baseUrl })
          .then((result) => {
            const lines = [
              `Initialized project at ${cwd}`,
              ...result.created.map((file) => `  + ${path.relative(cwd, file) || file}`),
              ...(result.alreadyExisted.length > 0 ? ['', 'Already present (left untouched):', ...result.alreadyExisted.map((file) => `  · ${path.relative(cwd, file) || file}`)] : []),
            ];
            append({ kind: 'system', title: 'init', body: lines.join('\n'), timestamp: formatTimestamp() });
          })
          .catch((error: unknown) => append({ kind: 'error', title: 'init', body: errorMessage(error) }));
      }
      if (command.name === 'new') {
        const title = command.args.join(' ') || 'Untitled session';
        setSession(createSession(title, cwd));
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
      if (command.name === 'load') void doLoadSession(command.args[0], setSession, append, setCwd);
      if (command.name === 'resume') void doResumeSession(command.args[0], setSession, append, setCwd);
      if (command.name === 'worktree') handleWorktreeCommand(command.args, append, setCwd, setSession);
      if (command.name === 'mcp') {
        const statuses = new Map(getMcpRegistry().status().map((entry) => [entry.name, entry]));
        append({
          kind: 'system',
          title: 'mcp servers',
          body: formatList('Configured MCP servers', (runtimeConfig.mcpServers ?? []).map((server) => {
            const status = statuses.get(server.name);
            const lifecycle = server.enabled === false
              ? 'disabled'
              : status?.error
                ? `error: ${status.error}`
                : status?.running
                  ? `running · ${status.toolCount} tools`
                  : 'not started';
            return `[${lifecycle}] ${server.name} — ${server.command} ${(server.args ?? []).join(' ')}`;
          })),
          timestamp: formatTimestamp(),
        });
      }
      if (command.name === 'skill') append({
        kind: 'system',
        title: 'skills (config)',
        body: formatList('Configured skills', (runtimeConfig.skills ?? []).map((skill) => `${skill.enabled === false ? '[disabled]' : '[enabled]'} ${skill.name}${skill.path ? ` — ${skill.path}` : ''}${skill.description ? ` — ${skill.description}` : ''}`)),
        timestamp: formatTimestamp(),
      });
      if (command.name === 'skills') {
        void discoverSkills(cwd)
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
        void discoverNamedSubagents(cwd)
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
      if (command.name === 'hooks') append({
        kind: 'system',
        title: 'hooks',
        body: formatList('Configured hooks', (runtimeConfig.hooks ?? []).map((hook) => `${hook.enabled === false ? '[disabled]' : '[enabled]'} ${describeHookConfig(hook)}`)),
        timestamp: formatTimestamp(),
      });
      if (command.name === 'tools') {
        const toolLines = tools.map((tool) => {
          const readOnlyTag = tool.readOnly ? ' (read-only)' : '';
          return `  ${tool.name}${readOnlyTag} — ${tool.description}`;
        });
        append({ kind: 'system', title: `tools (${tools.length})`, body: toolLines.join('\n'), timestamp: formatTimestamp() });
      }
      if (command.name === 'status' || command.name === 'info') append({ kind: 'system', title: command.name, body: formatInfo(runtimeConfig, session, tools, usage, cwd, mode, sandbox, sessionCost, contextBar, builtinToolCount, mcpToolCount, enabledMcpServers, enabledHooks, enabledConfigSkills, discoveredSkillsCount, namedSubagentsCount), timestamp: formatTimestamp() });
      if (command.name === 'workflow') append({
        kind: 'system',
        title: 'workflow',
        body: [
          formatWorkflowSummary({
            builtinTools: builtinToolCount,
            mcpServers: enabledMcpServers,
            mcpTools: mcpToolCount,
            configuredSkills: enabledConfigSkills,
            discoveredSkills: discoveredSkillsCount,
            hooks: enabledHooks,
            subagents: namedSubagentsCount,
          }),
          '',
          'Commands: /mcp · /skills · /hooks · /agents · /tools · /doctor',
        ].join('\n'),
        timestamp: formatTimestamp(),
      });
      if (command.name === 'timeline') append({ kind: 'system', title: 'timeline', body: formatTimeline(messages), timestamp: formatTimestamp() });

      if (command.name === 'mode') {
        const target = command.args[0];
        if (target === 'plan' || target === 'agent' || target === 'yolo') {
          switchMode(target);
        } else {
          setModePickerOpen(true);
        }
      }
      if (command.name === 'model') {
        const target = command.args[0];
        if (!target) {
          setModelPickerOpen(true);
        } else if (SUPPORTED_MODELS.includes(target as (typeof SUPPORTED_MODELS)[number])) {
          switchModel(target);
        } else {
          append({ kind: 'error', title: 'model', body: `Unsupported model: ${target}\n${SUPPORTED_MODELS.join('\n')}`, timestamp: formatTimestamp() });
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
          const diff = execSync('git diff --stat --patch', { cwd, encoding: 'utf8', timeout: 10_000 });
          append({ kind: 'diff', title: 'workspace diff', body: diff || 'No changes detected', timestamp: formatTimestamp() });
        } catch {
          append({ kind: 'error', title: 'diff', body: 'Not a git repository or git not available', timestamp: formatTimestamp() });
        }
      }
      if (command.name === 'doctor') {
        void runDiagnostics(runtimeConfig, cwd)
          .then((results) => append({ kind: 'system', title: 'diagnostics', body: formatDiagnostics(results), timestamp: formatTimestamp() }))
          .catch((error: unknown) => append({ kind: 'error', title: 'doctor', body: errorMessage(error) }));
      }
      if (command.name === 'memory') {
        const note = command.args.join(' ');
        if (note) {
          void addMemoryNote(note, cwd)
            .then((mem) => append({ kind: 'system', title: 'memory', body: `Saved note ${mem.id}: ${note}`, timestamp: formatTimestamp() }))
            .catch((error: unknown) => append({ kind: 'error', title: 'memory', body: errorMessage(error) }));
        } else {
          void listMemoryNotes(cwd)
            .then((notes) => {
              if (notes.length === 0) append({ kind: 'system', title: 'memory', body: 'No memory notes. Usage: /memory <note text>', timestamp: formatTimestamp() });
              else append({ kind: 'system', title: 'memory', body: notes.map((n) => `${n.id} [${n.scope}] ${n.content}`).join('\n'), timestamp: formatTimestamp() });
            })
            .catch((error: unknown) => append({ kind: 'error', title: 'memory', body: errorMessage(error) }));
        }
      }
      if (command.name === 'undo') {
        try {
          const revision = safeGitRevision(cwd);
          rollbackWorkspace(cwd, revision, append);
          append({ kind: 'system', title: 'undo', body: 'Reverted unstaged changes to HEAD', timestamp: formatTimestamp() });
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
      if (command.name === 'edit') {
        // Pause Ink's raw-mode stdin so the editor child can take over the
        // terminal cleanly. We restore raw mode + a fresh input frame on
        // return; if the editor crashes we still recover.
        try { setRawMode(false); } catch { /* ignore */ }
        void composeInEditor(prompt)
          .then((next) => {
            replacePrompt(next);
            append({ kind: 'system', title: 'edit', body: next ? 'Loaded edited prompt — press Enter to send.' : 'Editor returned empty — prompt unchanged.', timestamp: formatTimestamp() });
          })
          .catch((error: unknown) => append({ kind: 'error', title: 'edit', body: errorMessage(error) }))
          .finally(() => {
            try { setRawMode(true); } catch { /* ignore */ }
          });
      }

      return true;
    },
    [append, builtinToolCount, contextBar, discoveredSkillsCount, enabledConfigSkills, enabledHooks, enabledMcpServers, exitWithSessionId, mcpToolCount, messages, mode, namedSubagentsCount, cwd, runtimeConfig, sandbox, session, sessionCost, switchMode, switchModel, tools, usage],
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
      setEditingTurn(false);
      setPendingLines([]);
      setModelPickerOpen(false);
      setModePickerOpen(false);
      if (!task || running) {
        setPrompt('');
        return;
      }
      setPrompt('');
      if (task && !task.startsWith('/')) {
        lastUserPromptRef.current = task;
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
      runStartRef.current = safeGitRevision(cwd);
      const controller = new AbortController();
      abortRef.current = controller;
      // Echo the user's literal prompt to the transcript before mention
      // expansion so the visible history matches what they typed.
      append({ kind: 'user', title: 'you', body: task, timestamp: formatTimestamp() });
      void (async () => {
        let promptForModel = task;
        const expansion = await expandMentions(task, async (rel) => {
          const abs = path.resolve(cwd, rel);
          if (!abs.startsWith(path.resolve(cwd))) {
            throw new Error(`Refusing to read outside workspace: ${rel}`);
          }
          return readFile(abs, 'utf8');
        }).catch(() => undefined);
        if (expansion) {
          promptForModel = expansion.prompt;
          if (expansion.attached.length > 0) {
            append({
              kind: 'system',
              title: 'attached',
              body: expansion.attached.map((rel) => `  + ${rel}`).join('\n'),
              timestamp: formatTimestamp(),
            });
          }
          if (expansion.missing.length > 0) {
            append({
              kind: 'error',
              title: 'attached (missing)',
              body: expansion.missing.map((rel) => `  ! ${rel}`).join('\n'),
              timestamp: formatTimestamp(),
            });
          }
        }
        const userMessage: ChatMessage = { role: 'user', content: promptForModel };
        const history = [...session.messages];
        addSessionMessages([userMessage]);
        try {
          await agent.run(promptForModel, { onEvent: handleEvent, approveToolCall, signal: controller.signal }, history);
        } catch (error) {
          append({ kind: 'error', title: 'error', body: errorMessage(error), timestamp: formatTimestamp() });
        } finally {
          setRunning(false);
          setStreamingText('');
          abortRef.current = null;
        }
      })();
    },
    [addSessionMessages, agent, append, approveToolCall, handleEvent, handleSlashCommand, cwd, pendingLines, running, session.messages, wizard],
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
    // Ctrl+C: Codex-style double tap before quitting.
    if (key.ctrl && input === 'c') {
      const nowMs = Date.now();
      if (running) {
        if (nowMs - lastCtrlCRef.current < 1500) {
          exitWithSessionId();
          return;
        }
        append({ kind: 'system', title: 'interrupted', body: 'Stopping current run. Press Ctrl+C again to quit.', timestamp: formatTimestamp() });
        abortRef.current?.abort();
        lastCtrlCRef.current = nowMs;
        return;
      }
      if (nowMs - lastCtrlCRef.current < 1500) {
        exitWithSessionId();
        return;
      }
      lastCtrlCRef.current = nowMs;
      append({ kind: 'system', title: 'exit', body: `Press Ctrl+C again to quit.\nSession ${session.id}\nResume with: mimo-code --resume ${session.id.slice(0, 8)}`, timestamp: formatTimestamp() });
      return;
    }
    // Esc: cancel approval/interrupt; double tap on idle reopens last user turn.
    if (key.escape) {
      if (approval) {
        approval.resolve('deny');
        setApproval(undefined);
        return;
      }
      if (running) {
        append({ kind: 'system', title: 'interrupted', body: 'Stopping current run.', timestamp: formatTimestamp() });
        abortRef.current?.abort();
        flushStreaming();
        setStreamingThinking('');
        return;
      }
      if (pendingLines.length > 0) {
        setPendingLines([]);
        return;
      }
      if (!running && !prompt && lastUserPromptRef.current) {
        const nowMs = Date.now();
        if (nowMs - lastEscRef.current < 1500) {
          replacePrompt(lastUserPromptRef.current);
          setEditingTurn(true);
          rollbackSessionToLastUser(setSession);
          rollbackWorkspace(cwd, runStartRef.current, append);
          append({ kind: 'system', title: 'edit previous', body: 'Reopened previous prompt and rolled workspace back to the turn start.', timestamp: formatTimestamp() });
          lastEscRef.current = 0;
          return;
        }
        lastEscRef.current = nowMs;
        append({ kind: 'system', title: 'edit previous', body: 'Press Esc again to edit previous message and rollback this turn.', timestamp: formatTimestamp() });
      }
      return;
    }
    if (approval || running) return;
    if (key.shift && key.tab) {
      const order: InteractionMode[] = ['plan', 'agent', 'yolo'];
      switchMode(order[(order.indexOf(mode) + 1) % order.length] ?? 'agent');
      return;
    }
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
    // Tab: accept the highlighted @-mention if the popup is open, otherwise
    // cycle through slash-command completions.
    if (key.tab) {
      if (mentionResults.length > 0) {
        const ctx = findMentionAt(prompt, cursor);
        const pick = mentionResults[mentionIndex % mentionResults.length];
        if (ctx && pick) {
          const { value: nextValue, cursor: nextCursor } = applyMention(prompt, ctx, pick);
          setPrompt(nextValue);
          setCursorOverride(nextCursor);
          setCursor(nextCursor);
          setMentionResults([]);
        }
        return;
      }
      const completed = completeSlashCommand(prompt, slashIndex);
      if (completed) {
        replacePrompt(completed);
        setSlashIndex((index) => index + 1);
        setTabCycle((cycle) => cycle + 1);
      }
      return;
    }
    if (key.upArrow) {
      // Up/Down navigates the mention popup when it's open; otherwise it
      // walks the input history.
      if (mentionResults.length > 0) {
        setMentionIndex((idx) => (idx - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (suggestions.length > 0) {
        setSlashIndex((idx) => (idx - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (inputHistory.length === 0) return;
      const newIndex = historyIndex < 0 ? inputHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      replacePrompt(inputHistory[newIndex] ?? '');
      return;
    }
    if (key.downArrow) {
      if (mentionResults.length > 0) {
        setMentionIndex((idx) => (idx + 1) % mentionResults.length);
        return;
      }
      if (suggestions.length > 0) {
        setSlashIndex((idx) => (idx + 1) % suggestions.length);
        return;
      }
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
  const selectedSlash = suggestions[slashIndex % suggestions.length];
  const inputHint = pendingLines.length > 0 ? ` (line ${pendingLines.length + 1})` : '';
  const verb = activeTool ? `${verbForTool(activeTool.name)} ${activeTool.name}…` : mode === 'plan' ? 'Analyzing…' : 'Thinking…';
  const elapsed = activeTool ? formatDuration(now - activeTool.startedAt) : undefined;
  const inputLines = Math.max(1, prompt.split('\n').length);
  const handlePromptChange = useCallback(
    (value: string) => {
      setPrompt(value);
      if (cursorOverride !== undefined) setCursorOverride(undefined);
      if (historyIndex !== -1) setHistoryIndex(-1);
      if (tabCycle !== 0) setTabCycle(0);
      if (slashIndex !== 0) setSlashIndex(0);
    },
    [historyIndex, tabCycle, cursorOverride, slashIndex],
  );

  useEffect(() => {
    const id = setInterval(() => setBranch(detectBranch(cwd)), 5_000);
    return () => clearInterval(id);
  }, [cwd]);

  return (
    <Box flexDirection="column">
      <Box paddingX={1}>
        <Text>{topStatusLine(runtimeConfig, cwd, mode, branch, contextBar)}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {messages.slice(-28).map((message) => (
          <TranscriptEntry key={message.id} message={message} />
        ))}
        {streamingThinking ? (
          <Box flexDirection="column">
            <Text dimColor>✢ Thinking…</Text>
            <Text dimColor>{formatReasoning(tailText(streamingThinking, 12))}</Text>
          </Box>
        ) : null}
        {streamingText ? (
          <Box flexDirection="column">
            <Text color="cyan" bold>▎ mimo <Text dimColor>· streaming</Text></Text>
            <Text>{renderMarkdown(tailText(streamingText, 18))}</Text>
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
          <Text dimColor>{approval.tool.description}</Text>
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
          {modePickerOpen ? (
            <Box borderStyle="round" borderColor="blue" paddingX={1} flexDirection="column">
              <Text color="blue" bold>Mode</Text>
              <SelectInput
                items={(['plan', 'agent', 'yolo'] as InteractionMode[]).map((item) => ({ label: `${modeIndicator(item)} · ${describeSandbox(defaultSandboxForMode(item))}`, value: item }))}
                onSelect={(item) => {
                  switchMode(item.value);
                  setModePickerOpen(false);
                }}
              />
            </Box>
          ) : null}
          {modelPickerOpen ? (
            <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
              <Text color="cyan" bold>Model</Text>
              <SelectInput
                items={SUPPORTED_MODELS.map((modelName) => ({ label: `${modelName === runtimeConfig.model ? '› ' : '  '}${modelName}`, value: modelName }))}
                onSelect={(item) => {
                  switchModel(item.value);
                  setModelPickerOpen(false);
                }}
              />
            </Box>
          ) : null}
          {suggestions.length > 0 ? (
            <Box flexDirection="column" paddingX={1}>
              <Text dimColor>Commands</Text>
              {suggestions.map((suggestion) => {
                const selected = selectedSlash?.name === suggestion.name;
                return selected ? (
                  <Text key={suggestion.name} color="cyan">
                    › {suggestion.usage.padEnd(22)} <Text dimColor>{suggestion.description}</Text>
                  </Text>
                ) : (
                  <Text key={suggestion.name} dimColor>
                    {'  '}{suggestion.usage.padEnd(22)} <Text dimColor>{suggestion.description}</Text>
                  </Text>
                );
              })}
              <Text dimColor>↑/↓ select · Tab complete · Enter run</Text>
            </Box>
          ) : null}
          {mentionResults.length > 0 ? (
            <Box flexDirection="column" paddingX={1}>
              <Text dimColor>files matching "{findMentionAt(prompt, cursor)?.query ?? ''}" — Tab to insert · ↑↓ to choose</Text>
              {mentionResults.map((rel, idx) => {
                const active = idx === mentionIndex;
                return (
                  <Text key={rel} {...(active ? { color: 'cyan' as const } : { dimColor: true })}>
                    {active ? '› ' : '  '}{rel}
                  </Text>
                );
              })}
            </Box>
          ) : null}
          {pendingLines.length > 0 ? (
            <Box flexDirection="column" paddingX={1}>
              {pendingLines.map((line, idx) => (
                <Text key={idx} dimColor>… {line}</Text>
              ))}
            </Box>
          ) : null}
          <Box borderStyle="round" borderColor={wizard ? 'yellow' : editingTurn ? 'magenta' : modeBorderColor(mode)} paddingX={1} minHeight={inputLines + 2}>
            <Text color={wizard ? 'yellow' : editingTurn ? 'magenta' : modeBorderColor(mode)}>{wizard ? wizardPrompt(wizard) : `▎ ${editingTurn ? 'edit' : mode}${inputHint}`} </Text>
            <MimoTextInput
              key={inputKey}
              value={prompt}
              onChange={handlePromptChange}
              onSubmit={submit}
              onCursorChange={setCursor}
              cursorOverride={cursorOverride}
              placeholder="message MiMo · / for commands · @ for files · /keys for shortcuts"
            />
          </Box>
          <BottomStatusBar
            config={runtimeConfig}
            cwd={cwd}
            branch={branch}
            alwaysApprove={alwaysApprove}
            dryRun={options.dryRun}
            mcpToolCount={mcpToolCount}
            skillCount={enabledConfigSkills + discoveredSkillsCount}
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
  branch: string | undefined;
  alwaysApprove: boolean;
  dryRun: boolean | undefined;
  mcpToolCount: number;
  skillCount: number;
}

/**
 * Codex-style persistent status row, rendered directly under the input frame.
 * Shows the active mode, model, sandbox, cwd, git branch, context utilization,
 * token totals, and accumulated cost. We deliberately keep this on a single
 * dim line so the transcript above it stays the visual focus.
 */
function BottomStatusBar(props: BottomStatusBarProps): React.ReactElement {
  const { config, cwd, branch, alwaysApprove, dryRun, mcpToolCount, skillCount } = props;
  const segments = ['anthropic', `max ${config.maxTokens.toLocaleString()}`];
  if (alwaysApprove) segments.push('auto-approve');
  if (dryRun) segments.push('dry-run');
  if (mcpToolCount > 0) segments.push(`${mcpToolCount} MCP`);
  if (skillCount > 0) segments.push(`skills ${skillCount}`);
  segments.push(shortenPath(cwd));
  if (branch) segments.push(`⎇ ${branch}`);
  return (
    <Box paddingX={1}>
      <Text dimColor>{segments.join(' · ')} · /info for tokens</Text>
    </Box>
  );
}

function modeBorderColor(mode: InteractionMode): 'cyan' | 'blue' | 'red' {
  if (mode === 'plan') return 'blue';
  if (mode === 'yolo') return 'red';
  return 'cyan';
}

function formatTimeline(messages: TranscriptMessage[]): string {
  const events = messages
    .filter((message) => message.kind !== 'splash')
    .slice(-24)
    .map((message) => {
      const index = message.index !== undefined ? ` #${message.index}` : '';
      const timestamp = message.timestamp ? `${message.timestamp} ` : '';
      const title = `${message.kind}${index}: ${message.title}`.trim();
      const suffix = message.durationMs !== undefined ? ` (${formatDuration(message.durationMs)})` : '';
      return `${timestamp}${title}${suffix}`;
    });
  return events.length > 0 ? events.join('\n') : 'No activity yet.';
}

function formatReasoning(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line ? `│ ${line}` : '│'}`)
    .join('\n');
}

function formatInfo(
  config: RuntimeConfig,
  session: SessionRecord,
  tools: ToolDefinition[],
  usage: TokenUsage,
  cwd: string,
  mode: InteractionMode,
  sandbox: SandboxLevel,
  cost: CostEstimate | undefined,
  contextSummary: string,
  builtinTools: number,
  mcpTools: number,
  mcpServers: number,
  hooks: number,
  configuredSkills: number,
  discoveredSkills: number,
  subagents: number,
): string {
  return [
    `${modeIndicator(mode)} · ${config.model} · anthropic · max ${config.maxTokens.toLocaleString()}`,
    `Session ${session.id.slice(0, 8)} · ${session.messages.length} messages · ${shortenPath(cwd)}`,
    `Sandbox ${describeSandbox(sandbox)}`,
    `Context ${contextSummary || 'empty'} · Tokens ${formatUsage(usage) || 'none yet'} · Cost ${formatCost(cost) || 'n/a'}`,
    `Tools ${tools.length} total · ${builtinTools} built-in · ${mcpTools} MCP · ${mcpServers} server(s)`,
    `Workflow ${configuredSkills + discoveredSkills} skill(s) · ${hooks} hook(s) · ${subagents} named subagent(s)`,
  ].join('\n');
}

function tailText(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return [`… ${lines.length - maxLines} earlier line(s)`, ...lines.slice(-maxLines)].join('\n');
}

function formatList(label: string, lines: string[]): string {
  if (lines.length === 0) return `${label}: none`;
  return [`${label}:`, ...lines.map((line) => `  ${line}`)].join('\n');
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

function safeGitRevision(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', timeout: 1500 }).trim();
  } catch {
    return '';
  }
}

function rollbackWorkspace(
  cwd: string,
  revision: string,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
): void {
  if (!revision) return;
  try {
    const diff = execFileSync('git', ['diff', '--binary', revision], { cwd, encoding: 'utf8', timeout: 10_000 });
    if (!diff.trim()) return;
    execFileSync('git', ['apply', '-R', '--whitespace=nowarn'], { cwd, input: diff, encoding: 'utf8', timeout: 10_000 });
  } catch (error) {
    append({ kind: 'error', title: 'rollback', body: `Workspace rollback failed: ${errorMessage(error)}`, timestamp: formatTimestamp() });
  }
}

function rollbackSessionToLastUser(setSession: React.Dispatch<React.SetStateAction<SessionRecord>>): void {
  setSession((current) => {
    const lastUserIndex = current.messages.map((message) => message.role).lastIndexOf('user');
    if (lastUserIndex === -1) return current;
    return { ...current, messages: current.messages.slice(0, lastUserIndex), updatedAt: new Date().toISOString() };
  });
}

function handleWorktreeCommand(
  args: string[],
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
  setCwd: React.Dispatch<React.SetStateAction<string>>,
  setSession: React.Dispatch<React.SetStateAction<SessionRecord>>,
): void {
  const [subcommand, ...rest] = args;
  try {
    if (!subcommand || subcommand === 'list') {
      const output = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8', timeout: 10_000 });
      append({ kind: 'system', title: 'worktrees', body: formatWorktreeList(output), timestamp: formatTimestamp() });
      return;
    }
    if (subcommand === 'new') {
      const [worktreePath, branch] = rest;
      if (!worktreePath || !branch) {
        append({ kind: 'error', title: 'worktree', body: 'Usage: /worktree new <path> <branch>', timestamp: formatTimestamp() });
        return;
      }
      execFileSync('git', ['worktree', 'add', '-b', branch, worktreePath], { encoding: 'utf8', timeout: 30_000 });
      append({ kind: 'system', title: 'worktree created', body: `${worktreePath}\nbranch=${branch}`, timestamp: formatTimestamp() });
      return;
    }
    if (subcommand === 'open') {
      const [worktreePath] = rest;
      if (!worktreePath) {
        append({ kind: 'error', title: 'worktree', body: 'Usage: /worktree open <path>', timestamp: formatTimestamp() });
        return;
      }
      process.chdir(worktreePath);
      const nextCwd = process.cwd();
      setCwd(nextCwd);
      setSession(createSession(`Worktree ${path.basename(nextCwd)}`, nextCwd));
      append({ kind: 'system', title: 'worktree opened', body: `Changed workspace to ${nextCwd}.`, timestamp: formatTimestamp() });
      return;
    }
    if (subcommand === 'remove') {
      const [worktreePath] = rest;
      if (!worktreePath) {
        append({ kind: 'error', title: 'worktree', body: 'Usage: /worktree remove <path>', timestamp: formatTimestamp() });
        return;
      }
      execFileSync('git', ['worktree', 'remove', worktreePath], { encoding: 'utf8', timeout: 30_000 });
      append({ kind: 'system', title: 'worktree removed', body: worktreePath, timestamp: formatTimestamp() });
      return;
    }
    append({ kind: 'error', title: 'worktree', body: 'Usage: /worktree [list|new|open|remove]', timestamp: formatTimestamp() });
  } catch (error) {
    append({ kind: 'error', title: 'worktree', body: errorMessage(error), timestamp: formatTimestamp() });
  }
}

function formatWorktreeList(output: string): string {
  if (!output.trim()) return 'No git worktrees found.';
  const rows = output
    .trim()
    .split(/\n\n/u)
    .map((block) => {
      const lines = block.split('\n');
      const worktree = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length) ?? '(unknown)';
      const branch = lines.find((line) => line.startsWith('branch '))?.slice('branch '.length).replace('refs/heads/', '') ?? 'detached';
      const head = lines.find((line) => line.startsWith('HEAD '))?.slice('HEAD '.length, 'HEAD '.length + 8) ?? '';
      return `${branch.padEnd(24)} ${head}  ${worktree}`;
    });
  return ['branch                   head      path', ...rows].join('\n');
}

function formatSettingsMenu(state: ConfigWizard): string {
  const lines = [
    'Settings',
    'Choose a row, edit the value, then type save from Review.',
    '',
    `› Provider URL      ${state.draft.baseUrl ?? DEFAULT_BASE_URL}`,
    '  Wire format       Anthropic (/anthropic/v1/messages)',
    `  Model             ${state.draft.model ?? DEFAULT_MODEL}`,
    `  Max tokens        ${state.draft.maxTokens ?? 'auto'}`,
    `  Temperature       ${state.draft.temperature ?? DEFAULT_TEMPERATURE}`,
    `  Instructions      ${state.draft.systemPrompt ? 'custom' : 'default'}`,
    `  MCP servers       ${state.draft.mcpServers?.length ?? 0}`,
    `  Skills            ${state.draft.skills?.length ?? 0}`,
    `  Hooks             ${state.draft.hooks?.length ?? 0}`,
    '',
    'Esc cancel · back previous · save persist',
  ];
  return lines.join('\n');
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
    append({ kind: 'system', title: 'settings saved', body: `${filePath}\nRuntime-only API keys are not saved. Restart TUI to reload persisted settings.`, timestamp: formatTimestamp() });
    return;
  }
  const nextWizard = updateWizard(wizard, task);
  setWizard(nextWizard.error?.startsWith('Cancelled') ? undefined : nextWizard);
  if (nextWizard.error?.startsWith('Cancelled')) append({ kind: 'system', title: 'settings', body: nextWizard.error, timestamp: formatTimestamp() });
}

async function doLoadSession(
  prefix: string | undefined,
  setSession: React.Dispatch<React.SetStateAction<SessionRecord>>,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
  setCwd?: React.Dispatch<React.SetStateAction<string>>,
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
  setCwd?.(loaded.cwd);
  append({ kind: 'system', title: 'session loaded', body: `${loaded.title}\n${loaded.id}\ncwd=${loaded.cwd}\nmessages=${loaded.messages.length}`, timestamp: formatTimestamp() });
}

async function doResumeSession(
  prefix: string | undefined,
  setSession: React.Dispatch<React.SetStateAction<SessionRecord>>,
  append: (message: Omit<TranscriptMessage, 'id'>) => void,
  setCwd?: React.Dispatch<React.SetStateAction<string>>,
): Promise<void> {
  try {
    if (prefix) {
      await doLoadSession(prefix, setSession, append, setCwd);
      return;
    }
    const sessions = await listSessions();
    if (sessions.length === 0) {
      append({ kind: 'system', title: 'resume', body: 'No saved sessions to resume.', timestamp: formatTimestamp() });
      return;
    }
    const latest = sessions[0];
    if (!latest) return;
    setSession(latest);
    setCwd?.(latest.cwd);
    append({ kind: 'system', title: 'resumed', body: `${latest.title}\n${latest.id}\ncwd=${latest.cwd}\nmessages=${latest.messages.length}`, timestamp: formatTimestamp() });
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
