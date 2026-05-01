import type { AssistantResponse, ChatMessage, RuntimeConfig, ToolCall, ToolDefinition, TokenUsage } from '../types.js';
import { MiMoCliError } from '../utils/errors.js';
import { isRecord } from '../utils/json.js';
import { toAnthropicTools, toOpenAITools } from './tools.js';

export class MiMoClient {
  constructor(private readonly config: RuntimeConfig) {}

  async complete(messages: ChatMessage[], tools: ToolDefinition[]): Promise<AssistantResponse> {
    if (this.config.format === 'anthropic') {
      return this.completeAnthropic(messages, tools);
    }
    return this.completeOpenAI(messages, tools);
  }

  private async completeOpenAI(messages: ChatMessage[], tools: ToolDefinition[]): Promise<AssistantResponse> {
    const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map(toOpenAIMessage),
        tools: toOpenAITools(tools),
        tool_choice: 'auto',
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });
    const json = await parseResponse(response);
    const choices = readArray(json.choices, 'choices');
    const first = choices[0];
    if (!isRecord(first) || !isRecord(first.message)) {
      throw new MiMoCliError('OpenAI response did not contain a message');
    }
    const message = first.message;
    const toolCalls = readOptionalArray(message.tool_calls).map(parseOpenAIToolCall);
    return {
      content: typeof message.content === 'string' ? message.content : '',
      toolCalls,
      rawUsage: parseOpenAIUsage(json.usage),
    };
  }

  private async completeAnthropic(messages: ChatMessage[], tools: ToolDefinition[]): Promise<AssistantResponse> {
    const response = await fetch(`${this.config.baseUrl}/anthropic/v1/messages`, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: this.config.systemPrompt,
        messages: toAnthropicMessages(messages),
        tools: toAnthropicTools(tools),
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });
    const json = await parseResponse(response);
    const blocks = readArray(json.content, 'content');
    const text: string[] = [];
    const toolCalls: ToolCall[] = [];
    for (const block of blocks) {
      if (!isRecord(block)) continue;
      if (block.type === 'text' && typeof block.text === 'string') {
        text.push(block.text);
      }
      if (block.type === 'tool_use' && typeof block.id === 'string' && typeof block.name === 'string' && isRecord(block.input)) {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }
    return {
      content: text.join('\n').trim(),
      toolCalls,
      rawUsage: parseAnthropicUsage(json.usage),
    };
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.apiKey}`,
      'content-type': 'application/json',
    };
  }
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new MiMoCliError(`API returned non-JSON response (${response.status}): ${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    const message = isRecord(json) && isRecord(json.error) && typeof json.error.message === 'string' ? json.error.message : text;
    throw new MiMoCliError(`API request failed (${response.status}): ${message}`);
  }
  if (!isRecord(json)) {
    throw new MiMoCliError('API returned an invalid JSON payload');
  }
  return json;
}

function toOpenAIMessage(message: ChatMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  }
  const output: Record<string, unknown> = {
    role: message.role,
    content: message.content,
  };
  if (message.toolCalls && message.toolCalls.length > 0) {
    output.tool_calls = message.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: 'function',
      function: {
        name: toolCall.name,
        arguments: JSON.stringify(toolCall.input),
      },
    }));
  }
  return output;
}

function toAnthropicMessages(messages: ChatMessage[]): Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') {
      output.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
          },
        ],
      });
      continue;
    }
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const content: Record<string, unknown>[] = [];
      if (message.content) {
        content.push({ type: 'text', text: message.content });
      }
      content.push(
        ...message.toolCalls.map((toolCall) => ({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input,
        })),
      );
      output.push({ role: 'assistant', content });
      continue;
    }
    output.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content });
  }
  return output;
}

function parseOpenAIToolCall(value: unknown): ToolCall {
  if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.function)) {
    throw new MiMoCliError('OpenAI response contained an invalid tool call');
  }
  const fn = value.function;
  if (typeof fn.name !== 'string') {
    throw new MiMoCliError('OpenAI tool call missed function name');
  }
  const rawArguments = typeof fn.arguments === 'string' && fn.arguments.length > 0 ? fn.arguments : '{}';
  const input = JSON.parse(rawArguments) as unknown;
  if (!isRecord(input)) {
    throw new MiMoCliError(`Tool ${fn.name} arguments must be a JSON object`);
  }
  return { id: value.id, name: fn.name, input };
}

function parseOpenAIUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const usage: TokenUsage = {};
  if (typeof value.prompt_tokens === 'number') usage.inputTokens = value.prompt_tokens;
  if (typeof value.completion_tokens === 'number') usage.outputTokens = value.completion_tokens;
  if (isRecord(value.prompt_tokens_details) && typeof value.prompt_tokens_details.cached_tokens === 'number') {
    usage.cacheReadInputTokens = value.prompt_tokens_details.cached_tokens;
  }
  return usage;
}

function parseAnthropicUsage(value: unknown): TokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const usage: TokenUsage = {};
  if (typeof value.input_tokens === 'number') usage.inputTokens = value.input_tokens;
  if (typeof value.output_tokens === 'number') usage.outputTokens = value.output_tokens;
  if (typeof value.cache_read_input_tokens === 'number') usage.cacheReadInputTokens = value.cache_read_input_tokens;
  if (typeof value.cache_creation_input_tokens === 'number') usage.cacheCreationInputTokens = value.cache_creation_input_tokens;
  return usage;
}

function readArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new MiMoCliError(`API response missing array: ${name}`);
  }
  return value;
}

function readOptionalArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
