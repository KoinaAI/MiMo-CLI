import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Newline, render, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import SelectInput from 'ink-select-input';
import { CodingAgent } from '../agent/agent.js';
import { formatUsage } from '../agent/usage.js';
import type {
  AgentEvent,
  AgentOptions,
  RuntimeConfig,
  ToolApprovalDecision,
  ToolCall,
  ToolDefinition,
  TokenUsage,
} from '../types.js';
import { errorMessage } from '../utils/errors.js';
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
      body: `Full TUI mode · model=${config.model} · format=${config.format}\nworkspace=${options.cwd}`,
    },
  ]);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [approval, setApproval] = useState<PendingApproval | undefined>();
  const [usage, setUsage] = useState<TokenUsage>({});
  const [alwaysApprove, setAlwaysApprove] = useState(options.autoApprove);
  const alwaysApproveRef = useRef(options.autoApprove);

  const agent = useMemo(() => new CodingAgent(config, tools, options), [config, options, tools]);

  const append = useCallback((message: Omit<TuiMessage, 'id'>) => {
    setMessages((current) => [...current.slice(-80), { ...message, id: Date.now() + Math.random() }]);
  }, []);

  const handleEvent = useCallback(
    (event: AgentEvent) => {
      if (event.type === 'thinking') {
        append({ kind: 'system', title: eventLabel(event), body: 'Waiting for MiMo response…' });
      } else if (event.type === 'assistant_message') {
        append({ kind: 'assistant', title: 'MiMo', body: event.content });
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
    [append],
  );

  const approveToolCall = useCallback(
    async (toolCall: ToolCall, tool: ToolDefinition): Promise<ToolApprovalDecision> => {
      if (alwaysApproveRef.current) return 'approve';
      return new Promise((resolve) => {
        setApproval({ toolCall, tool, resolve });
      });
    },
    [],
  );

  const submit = useCallback(
    (value: string) => {
      const task = value.trim();
      if (!task || running) return;
      setPrompt('');
      setRunning(true);
      append({ kind: 'user', title: 'You', body: task });
      void agent
        .run(task, { onEvent: handleEvent, approveToolCall })
        .catch((error: unknown) => append({ kind: 'error', title: 'Error', body: errorMessage(error) }))
        .finally(() => setRunning(false));
    },
    [agent, append, approveToolCall, handleEvent, running],
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
      <Header config={config} options={options} usage={usage} alwaysApprove={alwaysApprove} />
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
        <Box borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan">任务&gt; </Text>
          <TextInput value={prompt} onChange={setPrompt} onSubmit={submit} placeholder="输入任务，Enter 发送，Esc/Ctrl+C 退出" />
        </Box>
      )}
      <Text dimColor>Shortcuts: Enter send · Esc/Ctrl+C quit · mutating tools require approval unless -y/always approve</Text>
    </Box>
  );
}

function Header({
  config,
  options,
  usage,
  alwaysApprove,
}: {
  config: RuntimeConfig;
  options: AgentOptions;
  usage: TokenUsage;
  alwaysApprove: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">MiMo Code CLI</Text>
      <Text dimColor>
        {config.model} · {config.format} · {config.baseUrl} · {options.cwd}
      </Text>
      <Text dimColor>
        {options.dryRun ? 'dry-run · ' : ''}{alwaysApprove ? 'auto-approve · ' : ''}{formatUsage(usage)}
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
