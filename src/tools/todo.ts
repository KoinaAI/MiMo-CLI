import type { ToolDefinition } from '../types.js';
import { asString, optionalString } from '../utils/json.js';

export interface TodoItem {
  id: string;
  text: string;
  status: 'pending' | 'in_progress' | 'done';
  createdAt: string;
}

const todoStore: TodoItem[] = [];
let nextId = 1;

export const todoAddTool: ToolDefinition = {
  name: 'todo_add',
  description: 'Add a task to the checklist for tracking work progress.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Task description.' },
    },
    required: ['text'],
    additionalProperties: false,
  },
  async run(input) {
    const text = asString(input.text, 'text');
    const item: TodoItem = {
      id: String(nextId),
      text,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    nextId += 1;
    todoStore.push(item);
    return `Added todo #${item.id}: ${text}`;
  },
};

export const todoUpdateTool: ToolDefinition = {
  name: 'todo_update',
  description: 'Update a task status in the checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID.' },
      status: { type: 'string', description: 'New status: pending, in_progress, or done.' },
      text: { type: 'string', description: 'Optional new description.' },
    },
    required: ['id', 'status'],
    additionalProperties: false,
  },
  async run(input) {
    const id = asString(input.id, 'id');
    const status = asString(input.status, 'status');
    if (status !== 'pending' && status !== 'in_progress' && status !== 'done') {
      return 'Invalid status. Use: pending, in_progress, or done.';
    }
    const item = todoStore.find((t) => t.id === id);
    if (!item) return `Todo #${id} not found`;
    item.status = status;
    const newText = optionalString(input.text, 'text');
    if (newText) item.text = newText;
    return `Updated todo #${id}: [${status}] ${item.text}`;
  },
};

export const todoListTool: ToolDefinition = {
  name: 'todo_list',
  description: 'List all tasks in the current checklist.',
  readOnly: true,
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  async run() {
    if (todoStore.length === 0) return 'No tasks in checklist';
    const statusIcon = (status: string) => {
      if (status === 'done') return '[x]';
      if (status === 'in_progress') return '[~]';
      return '[ ]';
    };
    return todoStore.map((item) => `#${item.id} ${statusIcon(item.status)} ${item.text}`).join('\n');
  },
};

export const todoTools: ToolDefinition[] = [todoAddTool, todoUpdateTool, todoListTool];

export function getTodoStore(): readonly TodoItem[] {
  return todoStore;
}

export function resetTodoStore(): void {
  todoStore.length = 0;
  nextId = 1;
}
