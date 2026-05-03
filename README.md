# MiMo Code CLI

MiMo Code CLI is a terminal-based Coding Agent powered by Xiaomi's MiMo models. It can read code, search text, edit files, and run commands within your local workspace, calling the MiMo API via the Anthropic-compatible interface to complete software development tasks.

## Features

- Full TUI, Web UI, and non-interactive modes: `mimo-code` / `mimo-code webui` / `mimo-code run "task"`.
- Claude Code–style borderless full-screen TUI: splash screen, message stream, tool calls, tool results, bottom input box, status bar, token usage, and keyboard shortcut hints.
- Browser-based Web UI with the same agent, sessions, tools, hooks, skills, and approval flow — inspired by [opencode](https://github.com/anomalyco/opencode).
- Approval UI for write-file, edit-file, and run-shell operations.
- Built-in `/settings` wizard in the TUI — no need to leave the terminal.
- Support for `/`-prefixed slash commands, Claude-style command selection, resumable sessions, MCP stdio tools, Skill loading, Hooks, and git worktrees.
- Works with both standard pay-as-you-go API Keys and Token Plan Keys.
- Uses the Anthropic-compatible `/anthropic` API format.
- Built-in coding tools: list directory, read file, write file, exact replace, full-text search, run shell command.
- Multi-level configuration: environment variables, project `.mimo-code.json`, user `~/.mimo-code/config.json`.
- File access is restricted to the current workspace by default to prevent unauthorized reads/writes.
- Dry-run mode for previewing file writes and shell commands before executing them.

## Installation

### Install from Source

```bash
git clone https://github.com/KoinaAI/MiMo-CLI.git
cd MiMo-CLI
npm install
npm run build
npm link
```

Then use:

```bash
mimo-code --help
mimo --help
```

### Local Development

```bash
npm install
npm run dev -- --help
npm run build
npm test
```

Node.js requirement: `>=20.0.0`.

## API & Models

### Base URL

Standard pay-as-you-go API Key:

```text
https://api.xiaomimimo.com
```

Token Plan Key:

```text
https://token-plan-<region>.xiaomimimo.com
```

Available `region` values:

- `cn` — China
- `sgp` — Singapore
- `ams` — Europe / Amsterdam

The CLI can generate a Token Plan Base URL directly:

```bash
mimo-code base-url --region cn
mimo-code base-url --region sgp
mimo-code base-url --region ams
```

### API Format

MiMo Code CLI uses the Anthropic-compatible endpoint only:

| Format | Endpoint |
| --- | --- |
| Anthropic-compatible | `<baseUrl>/anthropic/v1/messages` |

### Models

Supported models:

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2-pro`
- `mimo-v2-omni`
- `mimo-v2-flash`

`mimo-v2-omni` and `mimo-v2.5` support multimodal input; the CLI's Coding Agent workflow focuses on text tasks and code tool calls.

Maximum output tokens are capped automatically per model:

| Model | Max Output Tokens |
| --- | ---: |
| `mimo-v2.5-pro` | 131072 |
| `mimo-v2.5` | 131072 |
| `mimo-v2-pro` | 131072 |
| `mimo-v2-omni` | 131072 |
| `mimo-v2-flash` | 65536 |

List available models:

```bash
mimo-code models
```

## Configuration

### Interactive Configuration

```bash
mimo-code settings
```

Or inside the TUI:

```text
/settings
```

The TUI settings wizard covers: API Key, Base URL type, Token Plan region, custom Base URL, model, max output tokens, temperature, system prompt, MCP servers, skills, and hooks. Configuration is written to the user config file:

```text
~/.mimo-code/config.json
```

Example:

```json
{
  "apiKey": "YOUR_MIMO_API_KEY",
  "baseUrl": "https://api.xiaomimimo.com",
  "model": "mimo-v2.5-pro",
  "maxTokens": 4096,
  "temperature": 0,
  "mcpServers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "enabled": true
    }
  ],
  "skills": [
    {
      "name": "code-review",
      "path": ".mimo/skills/code-review.md",
      "description": "Review code before final answer",
      "enabled": true
    }
  ],
  "hooks": [
    {
      "name": "prompt-log",
      "event": "user_prompt",
      "command": "node",
      "args": ["scripts/log-hook.js"],
      "enabled": true
    }
  ]
}
```

### Environment Variables

Configuration can also be provided via environment variables:

```bash
export MIMO_API_KEY="YOUR_MIMO_API_KEY"
export MIMO_BASE_URL="https://api.xiaomimimo.com"
export MIMO_MODEL="mimo-v2.5-pro"
```

Supported environment variables:

| Variable | Description |
| --- | --- |
| `MIMO_API_KEY` | MiMo API Key — highest priority |
| `MIMO_BASE_URL` | Base URL |
| `MIMO_MODEL` | Default model |
| `MIMO_MAX_TOKENS` | Maximum output token count |
| `MIMO_TEMPERATURE` | Sampling temperature |
| `OPENAI_API_KEY` | Compatibility fallback |
| `OPENAI_BASE_URL` | Compatibility fallback |
| `ANTHROPIC_API_KEY` | Compatibility fallback |
| `ANTHROPIC_BASE_URL` | Compatibility fallback |

### Project-level Configuration

Create `.mimo-code.json` in the project root to override user defaults:

```json
{
  "baseUrl": "https://token-plan-sgp.xiaomimimo.com",
  "model": "mimo-v2.5",
  "maxTokens": 8192,
  "temperature": 0,
  "mcpServers": [],
  "skills": [],
  "hooks": []
}
```

Do not commit real API Keys to project-level config. Use environment variables or enter them at startup.

### Configuration Priority

From lowest to highest:

1. User config: `~/.mimo-code/config.json`
2. Project config: `./.mimo-code.json`
3. Environment variables
4. CLI flags

## Usage

### Web UI

```bash
mimo-code webui              # opens http://localhost:4280 in your browser
mimo-code webui --port 4444  # custom port
mimo-code webui --no-open    # do not auto-launch the browser
mimo-code webui --mode plan  # start in Plan mode (read-only tools)
```

The Web UI is a self-contained, opencode-inspired chat interface that ships with `mimo-code`. It exposes the same Coding Agent, sessions, MCP tools, skills, hooks, sandbox, and approval flow as the TUI — through a clean browser experience instead of the terminal.

Key capabilities:

- **Three-pane layout**: sessions sidebar · message stream · composer with mode/sandbox toggles
- **Streaming responses** via Server-Sent Events; thinking, tool calls, and tool results render live
- **Tool call inspector**: collapsible cards with input + result, diff colouring, and status badges
- **Approval dialog** for `write_file`, `edit_file`, `run_shell`, etc. (Approve once / Always / Deny)
- **Mode switcher** (Plan / Agent / Yolo) and **sandbox switcher** (read-only / workspace-write / danger-full-access) per turn
- **Session library**: sessions are persisted to `~/.mimo-code/sessions/` and shared with the TUI / `mimo-code session` CLI
- **Live token + cost meters** in the top bar

The backend is a tiny zero-dependency Node HTTP server bound to `127.0.0.1` by default; the frontend is plain HTML + CSS + ES modules with no build pipeline. Pass `--host 0.0.0.0` only if you intentionally want to expose the UI on your network.

### TUI Interactive Mode

```bash
mimo-code
```

Launches a full-screen Codex / Claude Code–style TUI. The interface includes:

- **Top status bar** — model · mode · cwd · git branch · context usage.
- **Splash screen** and command hints.
- **Session area** — user messages, MiMo replies, thinking blocks, tool calls, tool results (collapsible), with diff output rendered in ± color.
- **Bottom input box** — border color changes by mode (plan = blue, agent = cyan, yolo = red); status line shows sandbox level, model, and auto-approve state.
- **Approval area** — approve or deny write-file, edit-file, and run-shell operations with: Approve once / Always approve this session / Deny.

Keyboard shortcuts:

| Shortcut | Description |
| --- | --- |
| Enter | Send the current task (append `\` at end of line to continue on next line) |
| Tab | Cycle through slash command completions |
| Shift+Tab | Cycle Plan / Agent / YOLO mode |
| ↑ / ↓ | Browse input history (persisted at `~/.mimo-code/history`) |
| Ctrl+L | Clear the current message stream |
| Ctrl+U | Clear the current input |
| Ctrl+W | Delete the previous word |
| Esc | Cancel approval / clear continuation; double-tap when idle to edit the previous message and roll back the turn |
| Ctrl+C | Interrupt current run; double-tap to quit |

Slash commands:

| Command | Description |
| --- | --- |
| `/help` | Show command help |
| `/settings` | Run the settings wizard inside the TUI |
| `/init` | Create `.mimo-code.json`, `AGENTS.md`, and example skill/subagent in the current project |
| `/sessions` | List saved sessions |
| `/new [title]` | Start a new resumable session |
| `/load <session-id-prefix>` | Load a saved session |
| `/resume [session-id-prefix]` | Resume the most recent saved session or a specific session |
| `/save` | Save the current session to `~/.mimo-code/sessions/` |
| `/mcp` | Show current MCP server configuration |
| `/skill` | Show skills declared in the config file |
| `/skills` | Auto-discover skills in `.mimo/skills/*.md` and `~/.mimo-code/skills/*.md` |
| `/agents` | List named subagents in `.mimo/agents/*.md` |
| `/sandbox [level]` | View or switch sandbox: `read-only` / `workspace-write` / `danger-full-access` |
| `/hooks` | Show current Hook configuration |
| `/tools` | Show built-in tools and MCP tools |
| `/expand <#index\|all>` / `/collapse <#index\|all>` | Expand / collapse tool result blocks |
| `/diff` | Show workspace git diff |
| `/doctor` | Run configuration diagnostics |
| `/memory [note]` | Add or list persistent memory notes |
| `/undo` | Undo unstaged changes to HEAD |
| `/worktree [list\|new\|open\|remove]` | Manage git worktrees |
| `/compact` | Summarize history to reduce context pressure |
| `/context` | Show current context window usage |
| `/cost` | Show estimated cost for the current session |
| `/todo` | Show the agent task list |
| `/network [allow\|deny <host>]` | View or configure network allow/deny list |
| `/export <path>` | Export the current session to JSON |
| `/workflow` | Overview of MCP, skills, hooks, subagents, and local tool status |
| `/timeline` | Show recent activity timeline for the current session |
| `/mode [plan\|agent\|yolo]` | Open an interactive mode selector or switch mode |
| `/model [name]` | Open an interactive model selector or switch model |
| `/status` | Show runtime model, session, tools, and token status |
| `/info` | Show model, token, context, tools, workflow, and cost details |
| `/clear` | Clear visible messages |
| `/exit` | Exit the TUI |

### Project Structure

After running `/init`, the following structure is recommended for version control:

```
.mimo-code.json          # Project-level runtime config
AGENTS.md                # Project notes injected into the system prompt
.mimo/
  skills/                # *.md skill files with YAML frontmatter declaring trigger keywords
  agents/                # *.md named subagent files with YAML frontmatter declaring tool allowlists
```

#### Skills

Place Markdown files in `.mimo/skills/` or `~/.mimo-code/skills/`, for example:

```markdown
---
name: testing-discipline
description: Reminds the agent to run tests after every change.
triggers: [test, vitest, jest, pytest]
always: false
---

When the user changes source code, always run the relevant test suite ...
```

If any `triggers` keyword (case-insensitive) appears in the user prompt, the skill is automatically injected into the system prompt for that request. `always: true` loads the skill unconditionally.

#### Named Subagents

Place Markdown files in `.mimo/agents/`; the body becomes that subagent's system prompt:

```markdown
---
name: research-assistant
description: Investigates a topic and produces a written summary.
tools: [read_file, search_text, file_search, web_fetch]
max_iterations: 8
---

You are a focused research assistant ...
```

The main agent dispatches tasks to subagents by name via the `agent_dispatch` tool. Use `/agents` to list all discovered subagents.

#### Sandbox

The CLI validates each tool call against the active sandbox level before execution:

| Level | Behavior |
| --- | --- |
| `read-only` | Only allows tools with `readOnly: true` (read / search / list, etc.). |
| `workspace-write` (default agent mode) | Allows writes within the workspace; blocks absolute paths or `..` traversal. |
| `danger-full-access` (yolo mode) | No sandbox restrictions; equivalent to auto-approve everything. |

Use `/sandbox` to switch levels at runtime; `/mode` also synchronizes the sandbox level.

#### Hooks v2

`hooks` supports the following events: `session_start`, `user_prompt`, `before_tool`, `pre_tool_use`, `after_tool`, `post_tool_use`, `notification`, `stop`, `agent_done`, `subagent_done`.

- All hooks receive the `MIMO_HOOK_EVENT` and `MIMO_HOOK_PAYLOAD` environment variables, and a JSON payload via stdin.
- Tool-related hooks also receive `MIMO_TOOL_NAME`; the stop hook receives `MIMO_STOP_REASON`.
- When `pre_tool_use` exits with code `2`, the tool call is blocked; any other non-zero exit code is treated as a soft warning.
- `matcher`, `allowTools`, and `blockTools` support exact tool names or `prefix*` wildcards, e.g. `"matcher": "run_*"` applies only to shell/run tools.
- `timeoutMs` overrides the timeout for a single hook; `continueOnCancel: true` allows subsequent hooks to continue after a block.
- Test a hook chain manually: `mimo-code hooks run pre_tool_use --payload '{"toolName":"run_shell"}'`.

#### MCP

MCP stdio servers are spawned once at CLI startup and kept alive for the entire session; they are shut down together on `process.exit` / `SIGINT`. Configuration follows the `mcpServers` format shown above.

Resumable sessions are saved as JSON files at:

```text
~/.mimo-code/sessions/<session-id>.json
```

When a session is loaded, new tasks continue with the historical messages.

To use the older prompt-based console mode:

```bash
mimo-code --no-tui
```

### Non-interactive Mode

```bash
mimo-code run "Read this repository and summarize the main modules"
mimo-code run "Add unit tests for src/foo.ts and run them"
```

### Specify a Working Directory

```bash
mimo-code run -C /path/to/project "Fix TypeScript type errors"
```

### Using a Token Plan

```bash
MIMO_API_KEY="YOUR_TOKEN_PLAN_KEY" \
  mimo-code run \
  --token-plan-region sgp \
  --model mimo-v2.5-pro \
  "Inspect the project and run the tests"
```

### Using a Custom Base URL

```bash
mimo-code run \
  --base-url https://api.xiaomimimo.com \
  --model mimo-v2.5 \
  "Explain the code structure in the current directory"
```

### Dry-run Mode

Dry-run prevents file writes and shell commands from actually executing:

```bash
mimo-code run --dry-run "Refactor this module and run the tests"
```

## Built-in Tools

The agent can call the following tools:

| Tool | Description |
| --- | --- |
| `list_files` | List directory contents within the workspace |
| `read_file` | Read a UTF-8 text file |
| `write_file` | Write a UTF-8 file, creating parent directories automatically |
| `edit_file` | Perform an exact text replacement in a file and output a patch |
| `search_text` | Search the workspace with a JavaScript regex |
| `run_shell` | Run a shell command inside the workspace |

## MCP & Skills

### MCP stdio Tools

`mcpServers` stores each MCP server's `name`, `command`, `args`, `env`, and `enabled` flag. When starting the TUI or running non-interactively, MiMo Code spawns enabled stdio MCP servers, performs JSON-RPC `initialize` and `tools/list`, and registers discovered tools as agent-callable, named:

```text
mcp__<server-name>__<tool-name>
```

When the model calls an MCP tool, the CLI forwards the arguments to the server via `tools/call` and returns the text content to the agent. Use `/mcp` in the TUI to see MCP configuration, and `/tools` to see all built-in and MCP tools.

### Skills

`skills` stores each skill's `name`, `path`, `description`, and `enabled` flag. Before each agent run, enabled skills' Markdown content is read and injected as system context:

```json
{
  "skills": [
    {
      "name": "test-first",
      "path": ".mimo/skills/test-first.md",
      "description": "Prefer tests before edits",
      "enabled": true
    }
  ]
}
```

Use `/skill` in the TUI to view the current skill configuration.

## Hooks

Hooks forward agent lifecycle events to local commands. Supported events:

| Event | When it fires |
| --- | --- |
| `session_start` | TUI session starts |
| `user_prompt` | User sends a task |
| `before_tool` | Before a tool call |
| `pre_tool_use` | Before a tool call; exit code 2 blocks the call |
| `after_tool` | After a tool call |
| `post_tool_use` | After a tool call (compatibility alias) |
| `notification` | Notification-type events |
| `stop` | User interrupts or agent stops |
| `agent_done` | Agent finishes a response |
| `subagent_done` | Subagent finishes a response |

Hook commands are executed via `spawn(command, args)` with the current workspace as the working directory. Environment variables:

| Variable | Description |
| --- | --- |
| `MIMO_HOOK_EVENT` | Current event name |
| `MIMO_HOOK_PAYLOAD` | JSON payload with fields: cwd, prompt, toolName, toolInput, toolOutput, finalMessage, etc. |
| `MIMO_TOOL_NAME` | Tool name for tool-related hooks |
| `MIMO_STOP_REASON` | Stop reason for the stop hook |

Example:

```json
{
  "hooks": [
    {
      "name": "after-tool-log",
      "event": "after_tool",
      "command": "node",
      "args": ["scripts/hook-log.js"],
      "enabled": true
    }
  ]
}
```

Use `/hooks` in the TUI to view Hook configuration.

## Security Boundaries

- File tools refuse to access paths outside the current workspace.
- `--dry-run` can be used to preview writes and command execution.
- Never put real API Keys in repository files or commit history.
- The agent still relies on model judgment before running shell commands; when working with production repositories, use `--dry-run` first or review the output manually.

## Pricing Reference

Pay-as-you-go API:

- **China region** — Pro series: input (cache miss) ¥7.00 / MTok, output ¥21.00 / MTok; `mimo-v2.5`: input (cache miss) ¥2.80 / MTok, output ¥14.00 / MTok; `mimo-v2-flash`: input (cache miss) ¥0.70 / MTok, output ¥2.10 / MTok.
- **International** — Pro series: input (cache miss) $1.00 / MTok, output $3.00 / MTok; `mimo-v2.5`: input (cache miss) $0.40 / MTok, output $2.00 / MTok; `mimo-v2-flash`: input (cache miss) $0.10 / MTok, output $0.30 / MTok.
- Cache writes are free; cache-hit input price is lower.
- `mimo-v2-omni` and `mimo-v2-flash` do not support the 1M context tier.

Token Plan:

- Pro models consume `2x` the total input + output token count.
- Other models consume `1x`.

For authoritative pricing, refer to the MiMo console.

## Development & Testing

```bash
npm run lint
npm run typecheck
npm test
npm run build
node dist/cli.js --help
node dist/cli.js models
node dist/cli.js base-url --region sgp
```

TUI smoke test:

```bash
MIMO_API_KEY=dummy node dist/cli.js --help
MIMO_API_KEY=dummy node dist/cli.js --no-tui
```

## Project Structure

```text
src/
  agent/      Agent loop, system prompt, token usage aggregation
  api/        OpenAI / Anthropic compatible API clients
  cli.ts      CLI entry point
  config/     Config loading, saving, interactive config, TUI settings wizard
  hooks.ts    Agent lifecycle Hook execution
  mcp/        stdio MCP JSON-RPC client and tool registration
  session/    Resumable session storage
  skills/     Skill file loading and context injection
  tools/      File, search, and shell tools
  ui/         Ink TUI, slash commands, terminal output and formatting
  utils/      General utilities
```
