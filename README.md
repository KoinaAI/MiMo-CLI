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

默认进入 Claude Code 风格无边框全屏 TUI。界面包含：

- 开屏：MiMo Code ASCII welcome，提示 `/help` 与 Tab 补全。
- 会话区：用户消息、MiMo 回复、工具调用与工具结果。
- 底部输入区：`╭─mimo` 输入框、`╰─` 状态行，展示模型、API 格式、max token、工具数量、MCP/Skill/Hook 数量、会话 ID、工作区与 token usage。
- 审批区：写文件、编辑文件、运行 shell 命令前可选择 Approve once / Always approve this session / Deny。

快捷键：

| 快捷键 | 说明 |
| --- | --- |
| Enter | 发送当前任务 |
| Tab | 补全唯一匹配的 slash command |
| Esc | 退出 TUI |
| Ctrl+C | 退出 TUI |

Slash commands：

| 命令 | 说明 |
| --- | --- |
| `/help` | 显示命令帮助 |
| `/config` | 在 TUI 内运行完整配置向导 |
| `/sessions` | 列出已保存会话 |
| `/new [title]` | 开始一个新的可复用会话 |
| `/load <session-id-prefix>` | 加载保存过的会话 |
| `/save` | 保存当前会话到 `~/.mimo-code/sessions/` |
| `/mcp` | 显示当前 MCP server 配置 |
| `/skill` | 显示当前 Skill 配置 |
| `/hooks` | 显示当前 Hook 配置 |
| `/tools` | 显示内置工具与 MCP tools |
| `/status` | 显示运行时模型、会话、工具与 token 状态 |
| `/clear` | 清空当前可见消息 |
| `/exit` | 退出 TUI |

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
| `after_tool` | 工具调用后 |
| `agent_done` | Agent 完成回答 |

Hook 命令通过 `spawn(command, args)` 执行，工作目录为当前 workspace。环境变量：

| 变量 | 说明 |
| --- | --- |
| `MIMO_HOOK_EVENT` | 当前事件名 |
| `MIMO_HOOK_PAYLOAD` | JSON payload，包含 cwd、prompt、toolName、toolInput、toolOutput、finalMessage 等字段 |

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
