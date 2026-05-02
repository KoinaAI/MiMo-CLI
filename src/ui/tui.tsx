import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Newline, render, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { CodingAgent } from '../agent/agent.js';
import { createConfigWizardState, saveWizardConfig, updateWizard, wizardPrompt, wizardSummary } from '../config/tui-wizard.js';
import { createSession, listSessions, readSession, saveSession } from '../session/store.js';
import type {
  AgentEvent,
  AgentOptions,
  ChatMessage,
  RuntimeConfig,
  SessionRecord,
  ToolApprovalDecision,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from '../types.js';
import { errorMessage } from '../utils/errors.js';
import { completeSlashCommand, parseSlashCommand, slashCommandSuggestions, SLASH_COMMAND_HELP } from './commands.js';
import { eventLabel, summarizeToolInput, summarizeToolOutput } from './format.js';
import { SPLASH, statusLine } from './theme.js';

interface TuiMessage {
  id: number;
  kind: 'system' | 'user' | 'assistant' | 'tool' | 'error';
  title: string;
  body: string;
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
      body: `${SPLASH}\nClaude-style TUI · Type /help for commands · Tab completes slash commands`,
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | undefined>();
  const [usage, setUsage] = useState<TokenUsage>({});
  const [alwaysApprove, setAlwaysApprove] = useState(options.autoApprove);
  const [session, setSession] = useState<SessionRecord>(() => createSession('Untitled session', options.cwd));
  const [wizard, setWizard] = useState<ConfigWizard | undefined>();
  const alwaysApproveRef = useRef(options.autoApprove);

  const agent = useMemo(() => new CodingAgent(config, tools, options), [config, options, tools]);

  const append = useCallback((message: Omit<TuiMessage, 'id'>) => {
    setMessages((current) => [...current.slice(-160), { ...message, id: Date.now() + Math.random() }]);
  }, []);

  const addSessionMessages = useCallback((newMessages: ChatMessage[]) => {
    setSession((current) => ({ ...current, messages: [...current.messages, ...newMessages], updatedAt: new Date().toISOString() }));
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === 'thinking') {
        append({ kind: 'system', title: eventLabel(event), body: 'Waiting for MiMo response…' });
      } else if (event.type === 'assistant_message') {
        append({ kind: 'assistant', title: 'MiMo', body: event.content });
        addSessionMessages([{ role: 'assistant', content: event.content }]);
      } else if (event.type === 'tool_call') {
        append({ kind: 'tool', title: `⏺ ${event.name}`, body: summarizeToolInput(event.input) });
      } else if (event.type === 'tool_result') {
        append({ kind: 'tool', title: `⎿ ${event.name}`, body: summarizeToolOutput(event.content) });
      } else if (event.type === 'error') {
        append({ kind: 'error', title: 'Error', body: event.message });
      } else if (event.type === 'done') {
        setUsage(event.result.usage);
        append({ kind: 'system', title: 'Done', body: `Iterations: ${event.result.iterations}` });
      }
    },
    [addSessionMessages, append],
  );

  const approveToolCall = useCallback(async (toolCall: ToolCall, tool: ToolDefinition): Promise<ToolApprovalDecision> => {
    if (alwaysApproveRef.current) return 'approve';
    return new Promise((resolve) => {
      setApproval({ toolCall, tool, resolve });
    });
  }, []);

  const handleSlashCommand = useCallback(
    (value: string): boolean => {
      const command = parseSlashCommand(value);
      if (!command) return false;
      if (command.name === 'help') append({ kind: 'system', title: 'Slash commands', body: SLASH_COMMAND_HELP });
      if (command.name === 'exit') exit();
      if (command.name === 'clear') setMessages([]);
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
      if (command.name === 'tools') append({ kind: 'system', title: 'Tools', body: tools.map((tool) => `${tool.name} — ${tool.description}`).join('\n') });
      if (command.name === 'status') append({ kind: 'system', title: 'Status', body: statusLine(config, session, tools, usage, options.cwd) });
      return true;
    },
    [append, config, exit, options.cwd, session, tools, usage],
  );

  const submit = useCallback(
    (value: string) => {
      const task = value.trim();
      if (!task || running) return;
      setPrompt('');
      if (wizard) {
        void handleWizardInput(task, wizard, setWizard, append);
        return;
      }
      if (handleSlashCommand(task)) return;
      setRunning(true);
      append({ kind: 'user', title: 'You', body: task });
      const userMessage: ChatMessage = { role: 'user', content: task };
      const history = [...session.messages];
      addSessionMessages([userMessage]);
      void agent
        .run(task, { onEvent: handleEvent, approveToolCall }, history)
        .catch((error: unknown) => append({ kind: 'error', title: 'Error', body: errorMessage(error) }))
        .finally(() => setRunning(false));
    },
    [addSessionMessages, agent, append, approveToolCall, handleEvent, handleSlashCommand, running, session.messages, wizard],
  );

  useInput((input, key) => {
    if (approval || running) return;
    if (key.ctrl && input === 'c') exit();
    if (key.escape) exit();
    if (key.tab) {
      const completed = completeSlashCommand(prompt);
      if (completed) setPrompt(completed);
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

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="column" minHeight={20}>
        {messages.slice(-20).map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
        {running && !approval ? (
          <Text color="yellow">
            <Spinner type="dots" /> Thinking…
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
                <Text key={suggestion.name} dimColor>{suggestion.usage.padEnd(24)} {suggestion.description}</Text>
              ))}
            </Box>
          ) : null}
          <Box paddingX={1}>
            <Text color={wizard ? 'yellow' : 'cyan'}>╭─{wizard ? wizardPrompt(wizard) : 'mimo'} </Text>
            <TextInput value={prompt} onChange={setPrompt} onSubmit={submit} placeholder="message MiMo, /help, Tab complete" />
          </Box>
          <Box paddingX={1}>
            <Text color={wizard ? 'yellow' : 'cyan'}>╰─ </Text>
            <Text dimColor>{statusLine(config, session, tools, usage, options.cwd)}{alwaysApprove ? ' · auto-approve' : ''}{options.dryRun ? ' · dry-run' : ''}</Text>
          </Box>
        </Box>
      )}
      {wizard ? <Text color="yellow">{wizard.error ? `Error: ${wizard.error}` : wizard.step === 'review' ? wizardSummary(wizard) : 'back 返回 · cancel 取消 · save 保存'}</Text> : null}
      <Text dimColor>Enter send · Tab complete · Esc/Ctrl+C quit · /help commands</Text>
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
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>{prefix} {message.title}</Text>
      <Text>{message.body}<Newline /></Text>
    </Box>
  );
}

function colorForKind(kind: TuiMessage['kind']): 'gray' | 'green' | 'cyan' | 'yellow' | 'red' {
  if (kind === 'system') return 'gray';
  if (kind === 'user') return 'green';
  if (kind === 'assistant') return 'cyan';
  if (kind === 'tool') return 'yellow';
  return 'red';
}

function prefixForKind(kind: TuiMessage['kind']): string {
  if (kind === 'user') return '>';
  if (kind === 'assistant') return '✻';
  if (kind === 'tool') return '⏺';
  if (kind === 'error') return '✖';
  return '•';
}
