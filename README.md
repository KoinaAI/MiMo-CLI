# MiMo Code CLI

MiMo Code CLI 是一个基于小米 MiMo 模型的终端 Coding Agent。它可以在本地工作区内阅读代码、搜索文本、编辑文件、运行命令，并通过 OpenAI 兼容或 Anthropic 兼容接口调用 MiMo API 完成软件开发任务。

## 功能特性

- 完整 TUI 与非交互式两种使用方式：`mimo-code` / `mimo-code run "任务"`。
- Claude Code 风格无边框全屏 TUI：开屏、消息流、工具调用、工具结果、底部输入框、状态行、token usage、快捷键提示。
- 对写文件、编辑文件、运行 shell 等变更类工具提供审批 UI。
- TUI 内置 `/config` 全流程配置向导，无需离开终端界面。
- 支持 `/` 开头的内部命令、Tab 命令补全、可复用会话、MCP stdio tools、Skill 加载和 Hooks。
- 支持常规按量付费 API Key 与 Token Plan Key。
- 支持 OpenAI 兼容 `/v1` 与 Anthropic 兼容 `/anthropic` 两种 API 格式。
- 内置编码工具：列目录、读文件、写文件、精确替换、全文搜索、运行 shell 命令。
- 多级配置：环境变量、项目 `.mimo-code.json`、用户 `~/.mimo-code/config.json`。
- 默认限制文件访问在当前工作区内，避免越权读取/写入。
- 提供 dry-run 模式，便于预览写文件与 shell 命令。

## 安装

### 从源码安装

```bash
git clone https://github.com/KoinaAI/MiMo-CLI.git
cd MiMo-CLI
npm install
npm run build
npm link
```

然后即可使用：

```bash
mimo-code --help
mimo --help
```

### 本地开发

```bash
npm install
npm run dev -- --help
npm run build
npm test
```

Node.js 版本要求：`>=20.0.0`。

## API 与模型

### Base URL

常规按量付费 API Key：

```text
https://api.xiaomimimo.com
```

Token Plan Key：

```text
https://token-plan-<region>.xiaomimimo.com
```

`region` 可选：

- `cn`：中国
- `sgp`：新加坡
- `ams`：欧洲 / Amsterdam

CLI 可直接生成 Token Plan Base URL：

```bash
mimo-code base-url --region cn
mimo-code base-url --region sgp
mimo-code base-url --region ams
```

### API 格式

MiMo Code CLI 支持两种 API 格式：

| 格式 | 端点 |
| --- | --- |
| OpenAI 兼容 | `<baseUrl>/v1/chat/completions` |
| Anthropic 兼容 | `<baseUrl>/anthropic/v1/messages` |

通过 `--format openai` 或 `--format anthropic` 选择，也可以在配置中保存。

### 模型

支持模型：

- `mimo-v2.5-pro`
- `mimo-v2.5`
- `mimo-v2-pro`
- `mimo-v2-omni`
- `mimo-v2-flash`

其中 `mimo-v2-omni` 与 `mimo-v2.5` 支持多模态输入能力；当前 CLI 的 Coding Agent 工作流以文本任务与代码工具调用为主。

最大输出 token 会按模型自动限制：

| 模型 | 最大输出 token |
| --- | ---: |
| `mimo-v2.5-pro` | 131072 |
| `mimo-v2.5` | 131072 |
| `mimo-v2-pro` | 131072 |
| `mimo-v2-omni` | 131072 |
| `mimo-v2-flash` | 65536 |

查看模型列表：

```bash
mimo-code models
```

## 配置

### 交互式配置

```bash
mimo-code config
```

也可以在 TUI 中输入：

```text
/config
```

TUI 配置向导覆盖 API Key、Base URL 类型、Token Plan region、自定义 Base URL、API 格式、模型、最大输出 token、temperature、system prompt、MCP servers、skills 与 hooks。配置会写入用户配置文件：

```text
~/.mimo-code/config.json
```

示例：

```json
{
  "apiKey": "YOUR_MIMO_API_KEY",
  "baseUrl": "https://api.xiaomimimo.com",
  "format": "openai",
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

### 环境变量

也可以通过环境变量配置：

```bash
export MIMO_API_KEY="YOUR_MIMO_API_KEY"
export MIMO_BASE_URL="https://api.xiaomimimo.com"
export MIMO_MODEL="mimo-v2.5-pro"
export MIMO_API_FORMAT="openai"
```

支持的环境变量：

| 变量 | 说明 |
| --- | --- |
| `MIMO_API_KEY` | MiMo API Key，优先级最高 |
| `MIMO_BASE_URL` | Base URL |
| `MIMO_MODEL` | 默认模型 |
| `MIMO_API_FORMAT` | `openai` 或 `anthropic` |
| `MIMO_MAX_TOKENS` | 最大输出 token 数 |
| `MIMO_TEMPERATURE` | 温度 |
| `OPENAI_API_KEY` | 兼容回退 |
| `OPENAI_BASE_URL` | 兼容回退 |
| `ANTHROPIC_API_KEY` | 兼容回退 |
| `ANTHROPIC_BASE_URL` | 兼容回退 |

### 项目级配置

在项目根目录创建 `.mimo-code.json` 可以覆盖用户默认配置：

```json
{
  "baseUrl": "https://token-plan-sgp.xiaomimimo.com",
  "format": "anthropic",
  "model": "mimo-v2.5",
  "maxTokens": 8192,
  "temperature": 0,
  "mcpServers": [],
  "skills": [],
  "hooks": []
}
```

不要把真实 API Key 提交到项目级配置。推荐用环境变量或 `mimo-code config` 保存到用户目录。

### 配置优先级

从低到高：

1. 用户配置：`~/.mimo-code/config.json`
2. 项目配置：`./.mimo-code.json`
3. 环境变量
4. CLI 参数

## 使用方式

### TUI 交互式任务

```bash
mimo-code
```

默认进入 Codex / Claude Code 风格的全屏 TUI。界面包含：

- 顶部状态栏：模型 · 模式 · cwd · git 分支 · 上下文用量。
- 开屏 splash 与命令提示。
- 会话区：用户消息、MiMo 回复、思考块、工具调用、工具结果（可折叠），diff 输出自动以 ± 着色渲染。
- 底部输入框：根据模式自动着色边框（plan = 蓝、agent = 青、yolo = 红），下方显示沙箱级别、模型、auto-approve 等状态。
- 审批区：写文件、编辑文件、运行 shell 命令前可选择 Approve once / Always approve this session / Deny。

快捷键：

| 快捷键 | 说明 |
| --- | --- |
| Enter | 发送当前任务（行尾 `\` 换行继续输入） |
| Tab | 循环补全 slash 命令 |
| ↑ / ↓ | 浏览输入历史（持久化在 `~/.mimo-code/history`） |
| Ctrl+L | 清空当前消息流 |
| Ctrl+U | 清空当前输入 |
| Ctrl+W | 删除前一个单词 |
| Esc | 取消审批 / 清空续行 / 空闲时退出 |
| Ctrl+C | 中断当前运行 / 退出 |

Slash commands：

| 命令 | 说明 |
| --- | --- |
| `/help` | 显示命令帮助 |
| `/config` | 在 TUI 内运行完整配置向导 |
| `/init` | 在当前项目创建 `.mimo-code.json`、`AGENTS.md`、示例 skill 与示例 subagent |
| `/sessions` | 列出已保存会话 |
| `/new [title]` | 开始一个新的可复用会话 |
| `/load <session-id-prefix>` | 加载保存过的会话 |
| `/resume` | 恢复最近保存的会话 |
| `/save` | 保存当前会话到 `~/.mimo-code/sessions/` |
| `/mcp` | 显示当前 MCP server 配置 |
| `/skill` | 显示配置文件里声明的 skill |
| `/skills` | 自动发现 `.mimo/skills/*.md` 与 `~/.mimo-code/skills/*.md` |
| `/agents` | 列出 `.mimo/agents/*.md` 中的命名 subagent |
| `/sandbox [level]` | 查看或切换沙箱：`read-only` / `workspace-write` / `danger-full-access` |
| `/hooks` | 显示当前 Hook 配置 |
| `/tools` | 显示内置工具与 MCP tools |
| `/expand <#index\|all>` / `/collapse <#index\|all>` | 展开 / 折叠工具结果块 |
| `/diff` | 显示工作区 git diff |
| `/doctor` | 运行配置诊断 |
| `/memory [note]` | 添加或列出持久 memory note |
| `/undo` | git checkout 撤销当前修改 |
| `/compact` | 总结历史以降低上下文压力 |
| `/context` | 显示当前上下文窗口用量 |
| `/cost` | 显示当前会话累计费用估算 |
| `/todo` | 显示 agent 任务清单 |
| `/network [allow\|deny <host>]` | 查看或设置网络白名单/黑名单 |
| `/export <path>` | 导出当前会话到 JSON |
| `/workflow` | 总览 MCP、skills、hooks、subagents 与本地工具状态 |
| `/timeline` | 显示当前会话最近活动时间线 |
| `/mode [plan\|agent\|yolo]` | 切换交互模式（自动调整沙箱） |
| `/status` | 显示运行时模型、会话、工具与 token 状态 |
| `/clear` | 清空当前可见消息 |
| `/exit` | 退出 TUI |

### 项目结构

`/init` 之后建议把以下结构纳入版本控制：

```
.mimo-code.json          # 项目级运行时配置
AGENTS.md                # 给 agent 的项目说明（被自动注入到 system prompt）
.mimo/
  skills/                # `*.md` skill，YAML frontmatter 声明触发关键字
  agents/                # `*.md` 命名 subagent，YAML frontmatter 声明工具白名单
```

#### Skills

在 `.mimo/skills/` 或 `~/.mimo-code/skills/` 中放置 Markdown 文件，例如：

```markdown
---
name: testing-discipline
description: Reminds the agent to run tests after every change.
triggers: [test, vitest, jest, pytest]
always: false
---

When the user changes source code, always run the relevant test suite ...
```

`triggers` 中任一关键字（大小写不敏感）出现在用户提示里时，该 skill 会被自动注入到当前请求的 system prompt。`always: true` 表示无条件加载。

#### Named Subagents

在 `.mimo/agents/` 中放置 Markdown 文件，body 即为该 subagent 的 system prompt：

```markdown
---
name: research-assistant
description: Investigates a topic and produces a written summary.
tools: [read_file, search_text, file_search, web_fetch]
max_iterations: 8
---

You are a focused research assistant ...
```

主 agent 通过 `agent_dispatch` 工具按名字派发任务到 subagent。`/agents` 命令列出所有发现的 subagent。

#### Sandbox

CLI 在 agent 工具调用之前会按沙箱级别校验：

| 级别 | 行为 |
| --- | --- |
| `read-only` | 只允许 `readOnly: true` 的工具（read / search / list 等）。 |
| `workspace-write`（默认 agent 模式） | 允许写入工作区内文件；阻断绝对路径或 `..` 越界。 |
| `danger-full-access`（yolo 模式） | 不做沙箱限制，等价于自动批准。 |

`/sandbox` 命令运行时切换；`/mode` 也会同步切换默认沙箱。

#### Hooks v2

`hooks` 现在支持以下事件：`session_start`、`user_prompt`、`before_tool`、`pre_tool_use`、`after_tool`、`post_tool_use`、`notification`、`stop`、`agent_done`、`subagent_done`。

- 所有 hook 都会收到 `MIMO_HOOK_EVENT` 与 `MIMO_HOOK_PAYLOAD` 环境变量，并通过 stdin 收到一份 JSON payload。
- 工具相关 hook 还会收到 `MIMO_TOOL_NAME`；stop hook 会收到 `MIMO_STOP_REASON`。
- `pre_tool_use` 退出码为 `2` 时阻断当前工具调用；其它非零退出码视为软警告。
- `matcher`、`allowTools`、`blockTools` 支持精确匹配工具名或 `prefix*` 通配，例如 `"matcher": "run_*"` 只在 shell/run 类工具上生效。
- `timeoutMs` 可覆盖单个 hook 超时；`continueOnCancel: true` 可让后续 hook 在阻断后继续执行。
- `mimo-code hooks run pre_tool_use --payload '{"toolName":"run_shell"}'` 可手动测试 hook 链路。

#### MCP

MCP stdio 服务器在 CLI 启动时一次性 spawn 并保持运行，整个会话内复用同一个进程；`process.exit` / `SIGINT` 时统一关闭。配置示例同上 `mcpServers`。

可复用会话保存为 JSON 文件，路径为：

```text
~/.mimo-code/sessions/<session-id>.json
```

加载会话后，新任务会带上历史消息继续执行。

如果想使用旧的 prompt-based console 模式：

```bash
mimo-code --no-tui
```

### 非交互式任务

```bash
mimo-code run "阅读这个仓库并总结主要模块"
mimo-code run "为 src/foo.ts 增加单元测试，并运行测试"
```

### 指定工作区

```bash
mimo-code run -C /path/to/project "修复 TypeScript 类型错误"
```

### 使用 Token Plan

```bash
MIMO_API_KEY="YOUR_TOKEN_PLAN_KEY" \
  mimo-code run \
  --token-plan-region sgp \
  --format openai \
  --model mimo-v2.5-pro \
  "检查项目并运行测试"
```

### 使用 Anthropic 兼容格式

```bash
mimo-code run \
  --base-url https://api.xiaomimimo.com \
  --format anthropic \
  --model mimo-v2.5 \
  "解释当前目录的代码结构"
```

### Dry-run 模式

Dry-run 会阻止写文件与 shell 命令真正执行：

```bash
mimo-code run --dry-run "重构这个模块并运行测试"
```

## 内置工具

Agent 当前可调用以下工具：

| 工具 | 说明 |
| --- | --- |
| `list_files` | 列出工作区内目录内容 |
| `read_file` | 读取 UTF-8 文本文件 |
| `write_file` | 写入 UTF-8 文件并自动创建父目录 |
| `edit_file` | 对文件执行精确文本替换，并输出 patch |
| `search_text` | 使用 JavaScript 正则在工作区中搜索文本 |
| `run_shell` | 在工作区内运行 shell 命令 |

## MCP 与 Skills

### MCP stdio tools

`mcpServers` 保存 MCP server 的 `name`、`command`、`args`、`env`、`enabled`。启动 TUI 或非交互运行时，MiMo Code 会启动已启用的 stdio MCP server，执行 JSON-RPC `initialize` 与 `tools/list`，并把发现到的工具注册为 Agent 可调用工具，命名格式为：

```text
mcp__<server-name>__<tool-name>
```

当模型调用 MCP tool 时，CLI 会通过 `tools/call` 把参数转发给对应 server，并把 text content 汇总回传给 Agent。TUI 中 `/mcp` 可查看 MCP 配置，`/tools` 可查看全部内置工具与 MCP tools。

### Skills

`skills` 保存 skill 的 `name`、`path`、`description`、`enabled`。每轮 Agent 运行前会读取已启用 skill 的 Markdown/文本内容，并作为系统上下文注入：

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

TUI 中 `/skill` 可查看当前 Skill 配置。

## Hooks

Hooks 用于把 Agent 生命周期事件转发给本地命令。支持事件：

| 事件 | 触发时机 |
| --- | --- |
| `session_start` | TUI 会话启动 |
| `user_prompt` | 用户发送任务 |
| `before_tool` | 工具调用前 |
| `pre_tool_use` | 工具调用前，可用退出码 2 阻断 |
| `after_tool` | 工具调用后 |
| `post_tool_use` | 工具调用后兼容事件 |
| `notification` | 通知类事件 |
| `stop` | 用户中断或 agent 停止 |
| `agent_done` | Agent 完成回答 |
| `subagent_done` | Subagent 完成回答 |

Hook 命令通过 `spawn(command, args)` 执行，工作目录为当前 workspace。环境变量：

| 变量 | 说明 |
| --- | --- |
| `MIMO_HOOK_EVENT` | 当前事件名 |
| `MIMO_HOOK_PAYLOAD` | JSON payload，包含 cwd、prompt、toolName、toolInput、toolOutput、finalMessage 等字段 |
| `MIMO_TOOL_NAME` | 工具相关 hook 的工具名 |
| `MIMO_STOP_REASON` | stop hook 的停止原因 |

示例：

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

TUI 中 `/hooks` 可查看 Hook 配置。

## 安全边界

- 文件工具会拒绝访问当前工作区之外的路径。
- `dry-run` 可用于预览写入与命令执行。
- 不要把真实 API Key 放入仓库文件或提交历史。
- Agent 运行 shell 命令前仍依赖模型判断；处理生产仓库时建议先用 `--dry-run` 或人工审查输出。

## 计费参考

按量付费 API：

- 国内版：Pro 系列输入未命中缓存 ¥7.00 / MTok、输出 ¥21.00 / MTok；`mimo-v2.5` 输入未命中缓存 ¥2.80 / MTok、输出 ¥14.00 / MTok；`mimo-v2-flash` 输入未命中缓存 ¥0.70 / MTok、输出 ¥2.10 / MTok。
- 国际版：Pro 系列输入未命中缓存 $1.00 / MTok、输出 $3.00 / MTok；`mimo-v2.5` 输入未命中缓存 $0.40 / MTok、输出 $2.00 / MTok；`mimo-v2-flash` 输入未命中缓存 $0.10 / MTok、输出 $0.30 / MTok。
- 缓存写入免费，缓存命中输入价格更低。
- `mimo-v2-omni` 与 `mimo-v2-flash` 不支持 1M 上下文档位。

Token Plan：

- Pro 模型按输入输出总 token 的 `2x` 消耗。
- 其他模型按 `1x` 消耗。

具体价格以 MiMo 控制台为准。

## 开发与自测

```bash
npm run lint
npm run typecheck
npm test
npm run build
node dist/cli.js --help
node dist/cli.js models
node dist/cli.js base-url --region sgp
```

TUI smoke test：

```bash
MIMO_API_KEY=dummy node dist/cli.js --help
MIMO_API_KEY=dummy node dist/cli.js --no-tui
```

## 项目结构

```text
src/
  agent/      Agent 循环、系统提示词、token usage 汇总
  api/        OpenAI / Anthropic 兼容 API 客户端
  cli.ts      命令行入口
  config/     配置加载、保存、交互式配置、TUI 配置向导
  hooks.ts    Agent 生命周期 Hook 执行
  mcp/        stdio MCP JSON-RPC client 与 tool 注册
  session/    可复用会话存储
  skills/     Skill 文件加载与上下文注入
  tools/      文件、搜索、shell 工具
  ui/         Ink TUI、slash commands、终端输出与格式化
  utils/      通用工具
```
