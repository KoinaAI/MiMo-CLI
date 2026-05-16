<div align="center">
  <h1>🚀 MiMo Code CLI</h1>
  <p><strong>A powerful terminal-based Coding Agent powered by Xiaomi's MiMo models.</strong></p>
  
  <p>
    <a href="https://www.npmjs.com/package/@xiaomi-mimo/cli"><img src="https://img.shields.io/npm/v/@xiaomi-mimo/cli.svg?style=for-the-badge&color=blue" alt="npm version"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/node/v/@xiaomi-mimo/cli.svg?style=for-the-badge&color=green" alt="node version"></a>
    <a href="https://github.com/KoinaAI/MiMo-CLI"><img src="https://img.shields.io/github/stars/KoinaAI/MiMo-CLI.svg?style=for-the-badge&color=yellow" alt="GitHub stars"></a>
    <a href="https://github.com/KoinaAI/MiMo-CLI/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-GPLv2.0-blue.svg?style=for-the-badge" alt="License"></a>
  </p>
</div>

Welcome to **MiMo Code CLI**! This tool brings the power of Xiaomi's MiMo models directly into your local workspace. It can read code, search text, edit files, and run commands, securely integrating with the MiMo API via an Anthropic-compatible interface to streamline your software development workflow.

[![asciicast](https://asciinema.org/a/QGq0xs5zESNOoLrh.svg)](https://asciinema.org/a/QGq0xs5zESNOoLrh)
<div align="center"><p>just a demo</p></div>

---

## 📖 Table of Contents

- [✨ Features](#-features)
- [🚀 Installation](#-installation)
- [🧠 API & Models](#-api--models)
- [⚙️ Configuration](#-configuration)
- [💻 Usage](#-usage)
- [📂 Project Structure](#-project-structure)
- [🛠️ Built-in Tools](#-built-in-tools)
- [🔌 MCP & Skills](#-mcp--skills)
- [🪝 Hooks](#-hooks)
- [🛡️ Security Boundaries](#-security-boundaries)
- [💰 Pricing Reference](#-pricing-reference)
- [🧑‍💻 Development & Testing](#-development--testing)

---

## ✨ Features

- **Multi-Interface Support**: Full TUI, Web UI, and non-interactive modes (`mimo` / `mimo-code`).
- **Rich Terminal UI (TUI)**: Full-screen experience with smooth streaming. Features include static transcript rendering, throttled live deltas, command/file palettes, history search, compact large-paste placeholders, and context-aware footer hints.
- **Robust Architecture**: Supports `/`-prefixed slash commands, Claude-style command selection, `Ctrl+R` history search, resumable sessions, MCP stdio tools, Skill loading, Hooks, and git worktrees.
- **Flexible Billing**: Works seamlessly with both standard pay-as-you-go API Keys and Token Plan Keys.
- **Multi-Level Configuration**: Set defaults via environment variables, project `.mimo-code.json`, or user `~/.mimo-code/config.json`.
- **Built-in Security**: File access is restricted strictly to the current workspace to prevent unauthorized reads/writes.
- **Safe Execution**: Dry-run mode for previewing file writes and shell commands before executing them.

> ~~**Browser-based Web UI**: Features the same agent, sessions, tools, hooks, skills, and approval flow — inspired by [opencode](https://github.com/anomalyco/opencode).~~ *(Not implemented yet)*

---

## 🚀 Installation

*Current development version: `v0.3.0-alpha`.*

### 📦 Install via npm

Get started instantly via npm:

```bash
npm i -g @xiaomi-mimo/cli
```

Then use the CLI commands:

```bash
mimo-code --help
# or
mimo --help
```

### 🔨 Install from Source

```bash
git clone https://github.com/KoinaAI/MiMo-CLI.git
cd MiMo-CLI
npm install
npm run build
npm link
```

### 🧑‍💻 For Local Development

Requires **Node.js**: `>= 20.0.0`

```bash
npm install
npm run dev -- --help
npm run build
npm test
```

---

## 🧠 API & Models

### 🤖 Supported Models

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2-pro`
- `mimo-v2-omni`
- `mimo-v2-flash`

> **Note**: `mimo-v2.5` and `mimo-v2-omni` support multimodal input! In the TUI, simply attach image, video, or audio files by pasting/typing an `@path` reference (e.g., `@assets/screenshot.png`).

### 📏 Context Limits

Context defaults are selected based on your billing mode:

- **Token Plan**: `1M` context where supported.
- **Pay-as-you-go**: `256K` context.
- *Exceptions*: `mimo-v2-omni` and `mimo-v2-flash` do not support the 1M context tier. Context is automatically compacted near the context limit when using `mimo-v2.5`.

### 💳 Billing

Billing summaries are displayed cleanly via the `/info` command in the TUI.
For detailed information, please refer to [Pricing | Xiaomi Mimo](https://platform.xiaomimimo.com/docs/en-US/pricing).

---

## ⚙️ Configuration

### 🧙‍♂️ Interactive Configuration

```bash
mimo-code settings
```

Or inside the TUI:

```text
/settings
```

The TUI settings wizard covers: API Key, Base URL type, Token Plan region, custom Base URL, model, temperature, system prompt, MCP servers, skills, and hooks. Maximum output tokens are fixed by the model. 

Configuration is written to the user config file:

```text
~/.mimo-code/config.json
```

<details>
<summary>View Example Configuration</summary>

```json
{
  "apiKey": "YOUR_MIMO_API_KEY",
  "baseUrl": "https://api.xiaomimimo.com",
  "model": "mimo-v2.5-pro",
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
</details>

### 🌐 Environment Variables

Need to set configs on the fly? Use environment variables:

```bash
export MIMO_API_KEY="YOUR_MIMO_API_KEY"
export MIMO_BASE_URL="https://api.xiaomimimo.com"
export MIMO_MODEL="mimo-v2.5-pro"
```

| Variable | Description |
| --- | --- |
| `MIMO_API_KEY` | MiMo API Key — highest priority ✨ |
| `MIMO_BASE_URL` | Base URL |
| `MIMO_MODEL` | Default model |
| `MIMO_MAX_TOKENS` | *Legacy compatibility only; runtime output cap is fixed by model* |
| `MIMO_TEMPERATURE` | Sampling temperature |
| `OPENAI_API_KEY` | Compatibility fallback |
| `OPENAI_BASE_URL` | Compatibility fallback |
| `ANTHROPIC_API_KEY` | Compatibility fallback |
| `ANTHROPIC_BASE_URL` | Compatibility fallback |

### 📁 Project-level Configuration

Create a `.mimo-code.json` file in the project root to override user defaults seamlessly:

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

> ⚠️ **Security Warning**: Do NOT commit real API Keys to project-level configs. Always use environment variables or enter them at startup instead.

### 🔢 Configuration Priority

From lowest to highest priority:
1. `⚙️ User config`: `~/.mimo-code/config.json`
2. `📂 Project config`: `./.mimo-code.json`
3. `🌐 Environment variables`
4. `⌨️ CLI flags`

---

## 💻 Usage

### 🌐 Web UI (Alpha)

```bash
mimo-code webui              # opens http://localhost:4280 in your browser
mimo-code webui --port 4444  # custom port
mimo-code webui --no-open    # do not auto-launch the browser
mimo-code webui --mode plan  # start in Plan mode (read-only tools)
```

The Web UI is a self-contained, opencode-inspired chat interface that ships directly with `mimo-code`. It exposes the same powerful Coding Agent through a clean browser experience instead of the terminal.

**Key capabilities:**
- **Three-pane layout**: Sessions sidebar · Message stream · Composer with mode/sandbox toggles.
- **Streaming responses**: Live Server-Sent Events showing thinking, tool calls, and tool results.
- **Tool call inspector**: Collapsible cards with input + result, diff colouring, and status badges.
- **Approval dialog**: Granular controls (`Approve once` / `Always` / `Deny`) for potentially dangerous operations.
- **Mode switcher**: Seamlessly swap between `Plan` / `Agent` / `Yolo` and per-turn sandboxes.
- **Session library**: Saved locally, shared directly with the TUI.
- **Live Meters**: Keep an eye on tokens and costs effortlessly.

### ⌨️ TUI Interactive Mode

```bash
mimo-code
```

Launches a full-screen modern TUI featuring:
- **Top status bar**: Model · Mode · CWD · Git branch · Context usage.
- **Session area**: User messages, MiMo replies, collapsible tool results, and colored diff outputs.
- **Bottom input box**: Color-coded borders based on mode (`plan` = blue, `agent` = cyan, `yolo` = red).
- **Approval area**: Secure workflow prompts for write operations.

**Keyboard Shortcuts:**
| Shortcut | Description |
| --- | --- |
| `Enter` | Send the current task (append `\` at end of line for multiline) |
| `Tab` | Cycle through slash command completions |
| `Shift+Tab` | Cycle Plan / Agent / YOLO modes |
| `↑` / `↓` | Browse input history |
| `Ctrl+L` | Clear the current message stream |
| `Ctrl+U` | Clear the current input |
| `Ctrl+W` | Delete the previous word |
| `Esc` | Cancel approval / clear continuation (double-tap to edit previous message) |
| `Ctrl+C` | Interrupt current run (double-tap to quit) |

**Handy Slash Commands:**
| Command | Description |
| --- | --- |
| `/help` | Show command help |
| `/settings` | Run the TUI settings wizard |
| `/init` | Bootstrap project configuration (`.mimo-code.json`, `AGENTS.md`) |
| `/sessions` | List saved sessions |
| `/mcp`, `/skills`, `/hooks`, `/agents` | Inspect configurations |
| `/doctor` | Run configuration diagnostics |
| `/diff`, `/undo`, `/worktree` | Git workflow support |
| `/status`, `/info`, `/cost`, `/context` | Monitor current execution |

*(For the complete command list, simply type `/` in the TUI.)*

### 🤖 Non-interactive Mode

Pass tasks directly for quick one-offs:
```bash
mimo-code run "Read this repository and summarize the main modules"
mimo-code run --dry-run "Add unit tests for src/foo.ts and run them"
```

---

## 📂 Project Structure

After running `/init`, maintain cleanliness by versioning these files:

```bash
.mimo-code.json          # Project-level runtime config
AGENTS.md                # Project notes injected into the system prompt
.mimo/
  skills/                # *.md skill files (YAML frontmatter)
  agents/                # *.md named subagent files (YAML frontmatter)
```

### 🧠 Skills

Drop Markdown files in `.mimo/skills/` or `~/.mimo-code/skills/`. They trigger based on keywords:

```markdown
---
name: testing-discipline
description: Reminds the agent to run tests after every change.
triggers: [test, vitest, jest, pytest]
always: false
---
When the user changes source code, always run the relevant test suite ...
```

### 🗣️ Named Subagents

Create specialized assistants in `.mimo/agents/`:

```markdown
---
name: research-assistant
description: Investigates a topic and produces a written summary.
tools: [read_file, search_text, file_search, web_fetch]
max_iterations: 8
---
You are a focused research assistant ...
```
The main agent can dispatch tasks to these via the `agent_dispatch` tool.

---

## 🛠️ Built-in Tools

| Tool | Description |
| --- | --- |
| `list_files` | List directory contents within the workspace |
| `read_file` | Read a UTF-8 text file |
| `write_file` | Write a UTF-8 file, creating parent directories automatically |
| `edit_file` | Perform an exact text replacement in a file and output a patch |
| `search_text` | Search the workspace with a JavaScript regex |
| `run_shell` | Run a shell command inside the workspace |

---

## 🔌 MCP & Skills

### MCP stdio Tools

Enabled stdio MCP servers are spawned on startup. MiMo CLI natively supports `initialize`, `tools/list`, and `tools/call`.
The agent will have access to named instances like `mcp__<server-name>__<tool-name>`. 
Check `/tools` in the TUI for everything available!

### Skills Integration

Skills defined in the config run dynamically to inject smart context:
```json
{
  "skills": [
    {
      "name": "test-first",
      "path": ".mimo/skills/test-first.md",
      "enabled": true
    }
  ]
}
```

---

## 🪝 Hooks

Hooks map agent lifecycle events seamlessly to your local scripts via `spawn()`. 

**Events:** `session_start`, `user_prompt`, `before_tool`, `pre_tool_use`, `after_tool`, `post_tool_use`, `notification`, `stop`, `agent_done`, `subagent_done`.

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

> **Pro-Tip**: When a `pre_tool_use` hook exits with code `2`, the tool call is instantly blocked. Custom validation made easy!

---

## 🛡️ Security Boundaries

We take sandbox security seriously:
- **Workspace Lock**: File tools aggressively refuse to access paths outside the current workspace.
- **Dry Runs**: Use `--dry-run` to trace and review operations harmlessly.
- **Approval Flow**: `workspace-write` mode stops malicious execution but allows files while `danger-full-access` unchains the beast.
- **Manual Overrides**: You always retain validation power through the approval dialog.

---

## 💰 Pricing Reference

**Pay-as-you-go API:**
- **China region** — Pro series: Input ¥7.00/MTok, Output ¥21.00/MTok | `mimo-v2.5`: Input ¥2.80/MTok, Output ¥14.00/MTok.
- **International** — Pro series: Input $1.00/MTok, Output $3.00/MTok | `mimo-v2.5`: Input $0.40/MTok, Output $2.00/MTok.

> *Cache writes are free, accelerating your repeated queries for less money.*

**Token Plan:**
- Pro models consume `2x` the total input + output token count. Others consume `1x`.

*(Check the official MiMo console for real-time adjustments!)*

---

## 🧑‍💻 Development & Testing

Want to hack on MiMo Code CLI? Welcome aboard!

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

**TUI Smoke Test:**
```bash
MIMO_API_KEY=dummy node dist/cli.js --help
MIMO_API_KEY=dummy node dist/cli.js --no-tui
```

> Thanks to [LINUX DO](https://linux.do/) community.

---
<div align="center">
  <i>Made with ❤️ by the KoinaAI Team</i>
</div>
