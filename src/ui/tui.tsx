import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Newline, render, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { CodingAgent } from '../agent/agent.js';
import { formatUsage } from '../agent/usage.js';
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
import { parseSlashCommand, SLASH_COMMAND_HELP } from './commands.js';
import { eventLabel, summarizeToolInput, summarizeToolOutput } from './format.js';

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
      title: 'MiMo Code CLI',
      body: `Full TUI mode · model=${config.model} · format=${config.format}\nworkspace=${options.cwd}\nType /help for commands.`,
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
    setMessages((current) => [...current.slice(-120), { ...message, id: Date.now() + Math.random() }]);
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
        append({ kind: 'tool', title: `Tool request: ${event.name}`, body: summarizeToolInput(event.input) });
      } else if (event.type === 'tool_result') {
        append({ kind: 'tool', title: `Tool result: ${event.name}`, body: summarizeToolOutput(event.content) });
      } else if (event.type === 'error') {
        append({ kind: 'error', title: 'Error', body: event.message });
      } else if (event.type === 'done') {
        setUsage(event.result.usage);
        append({ kind: 'system', title: 'Done', body: `Iterations: ${event.result.iterations} · ${formatUsage(event.result.usage)}` });
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
      if (command.name === 'load') {
        void loadSession(command.args[0], setSession, append);
      }
      if (command.name === 'mcp') {
        append({ kind: 'system', title: 'MCP servers', body: JSON.stringify(config.mcpServers ?? [], null, 2) });
      }
      if (command.name === 'skill') {
        append({ kind: 'system', title: 'Skills', body: JSON.stringify(config.skills ?? [], null, 2) });
      }
      return true;
    },
    [append, config.mcpServers, config.skills, exit, options.cwd, session],
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
  });

  const approvalItems = approval
    ? [
        { label: 'Approve once', value: 'approve' as const },
        { label: 'Always approve this session', value: 'always' as const },
        { label: 'Deny', value: 'deny' as const },
      ]
    : [];

  return (
    <Box flexDirection="column" paddingX={1}>
      <Header config={config} options={options} usage={usage} alwaysApprove={alwaysApprove} session={session} />
      <Box borderStyle="round" borderColor="gray" flexDirection="column" paddingX={1} minHeight={18}>
        {messages.slice(-18).map((message) => (
          <MessageView key={message.id} message={message} />
        ))}
        {running && !approval ? (
          <Text color="yellow">
            <Spinner type="dots" /> Running agent…
          </Text>
        ) : null}
      </Box>
      {approval ? (
        <Box borderStyle="round" borderColor="yellow" flexDirection="column" paddingX={1}>
          <Text color="yellow">Approve tool call: {approval.tool.name}</Text>
          <Text>{summarizeToolInput(approval.toolCall.input, 500)}</Text>
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
        <Box borderStyle="single" borderColor={wizard ? 'yellow' : 'cyan'} paddingX={1}>
          <Text color={wizard ? 'yellow' : 'cyan'}>{wizard ? `${wizardPrompt(wizard)}> ` : '任务> '}</Text>
          <TextInput value={prompt} onChange={setPrompt} onSubmit={submit} placeholder="输入任务或 /help，Enter 发送，Esc/Ctrl+C 退出" />
        </Box>
      )}
      {wizard ? <Text color="yellow">{wizard.error ? `Error: ${wizard.error}` : wizard.step === 'review' ? wizardSummary(wizard) : 'back 返回 · cancel 取消'}</Text> : null}
      <Text dimColor>Shortcuts: Enter send · Esc/Ctrl+C quit · /help commands · mutating tools require approval unless -y/always approve</Text>
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

function Header({
  config,
  options,
  usage,
  alwaysApprove,
  session,
}: {
  config: RuntimeConfig;
  options: AgentOptions;
  usage: TokenUsage;
  alwaysApprove: boolean;
  session: SessionRecord;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">MiMo Code CLI</Text>
      <Text dimColor>
        {config.model} · max {config.maxTokens} · {config.format} · {config.baseUrl} · {options.cwd}
      </Text>
      <Text dimColor>
        session={session.title} {session.id.slice(0, 8)} · MCP {config.mcpServers?.length ?? 0} · Skills {config.skills?.length ?? 0} · {options.dryRun ? 'dry-run · ' : ''}{alwaysApprove ? 'auto-approve · ' : ''}{formatUsage(usage)}
      </Text>
    </Box>
  );
}

function MessageView({ message }: { message: TuiMessage }): React.ReactElement {
  const color = colorForKind(message.kind);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>{message.title}</Text>
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
