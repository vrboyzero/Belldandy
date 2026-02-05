# Belldandy

<p align="center">
  <strong>🌟 本地优先的个人 AI 助手</strong><br>
  在你自己的设备上运行，通过多种聊天渠道为你服务
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#配置指南">配置指南</a> •
  <a href="#飞书对接">飞书对接</a> •
  <a href="#高级功能">高级功能</a> •
  <a href="#常见问题">FAQ</a>
</p>

---

## 简介

Belldandy 是一个 **本地优先（local-first）** 的个人 AI 助手项目。它运行在你自己的电脑上，注重隐私、安全，并具备记忆、工具使用、语音交互等强大能力。

### 设计原则

- **🔒 单人使用、私密优先**：默认不提供公开分享功能，所有数据存储在本地
- **🛡️ 安全默认值**：所有入站消息默认视为不可信输入；工具执行采用白名单与最小权限
- **🔌 可扩展**：通过 plugins/skills 机制扩展渠道、工具与能力

### 技术栈

| 类别 | 技术 |
|------|------|
| **语言** | TypeScript |
| **运行时** | Node.js 22+ |
| **包管理** | pnpm (monorepo) |
| **数据库** | SQLite + FTS5 + sqlite-vec |
| **通信协议** | WebSocket |
| **前端** | 原生 JS/CSS (零依赖) |
| **浏览器自动化** | Chrome Extension (MV3) + CDP |
| **语音合成** | Edge TTS / OpenAI TTS |
| **向量检索** | sqlite-vec (C++ SIMD 加速) |

### 项目架构

```
Belldandy/
├── packages/
│   ├── belldandy-core/              # 核心服务
│   │   ├── server.ts                # Gateway 主入口
│   │   ├── logger/                  # 日志系统 (控制台+文件轮转)
│   │   ├── heartbeat/               # 心跳定时任务
│   │   └── pairing/                 # 配对认证系统
│   │
│   ├── belldandy-agent/             # Agent 运行时
│   │   ├── tool-agent.ts            # 工具调用循环 (ReAct)
│   │   ├── hooks.ts                 # 13 种生命周期钩子
│   │   ├── hook-runner.ts           # 钩子执行器
│   │   ├── system-prompt.ts         # System Prompt 构建
│   │   └── templates/               # 人格模板 (SOUL/IDENTITY/...)
│   │
│   ├── belldandy-channels/          # 渠道层
│   │   ├── types.ts                 # Channel 通用接口
│   │   ├── manager.ts               # 多渠道管理器
│   │   └── feishu.ts                # 飞书实现 (WebSocket)
│   │
│   ├── belldandy-skills/            # 工具系统
│   │   ├── builtin/
│   │   │   ├── fetch.ts             # 网页抓取 (SSRF 防护)
│   │   │   ├── file.ts              # 文件读写 (路径遍历防护)
│   │   │   ├── list-files.ts        # 目录列表
│   │   │   ├── apply-patch/         # Diff 补丁应用
│   │   │   ├── web-search/          # 网络搜索 (Brave/SerpAPI)
│   │   │   ├── system/              # 系统命令 (Safe Mode)
│   │   │   ├── browser/             # 浏览器自动化工具集
│   │   │   ├── memory.ts            # 记忆检索工具
│   │   │   ├── log.ts               # 日志读取与搜索 (log_read/log_search)
│   │   │   ├── multimedia/          # 多媒体 (TTS/图像/摄像头)
│   │   │   ├── methodology/         # 方法论 SOP 工具
│   │   │   ├── session/             # 会话编排 (spawn/history)
│   │   │   └── code-interpreter/    # 代码解释器 (Python/JS)
│   │   ├── executor.ts              # 工具执行器
│   │   └── types.ts                 # 工具类型定义
│   │
│   ├── belldandy-memory/            # 记忆系统
│   │   ├── store.ts                 # SQLite + FTS5 存储
│   │   ├── vector.ts                # sqlite-vec 向量检索
│   │   ├── chunker.ts               # 文本分块器
│   │   └── indexer.ts               # 增量索引器
│   │
│   ├── belldandy-mcp/               # MCP 协议支持
│   │   ├── types.ts                 # MCP 类型定义
│   │   ├── config.ts                # 配置加载与验证
│   │   ├── client.ts                # MCP 客户端封装
│   │   ├── tool-bridge.ts           # 工具桥接器
│   │   └── manager.ts               # 多服务器管理器
│   │
│   ├── belldandy-plugins/           # 插件系统
│   │   └── registry.ts              # 动态加载 + Hook 聚合
│   │
│   └── belldandy-browser/           # 浏览器控制
│       └── relay.ts                 # WebSocket-CDP 中继
│
├── apps/
│   ├── web/                         # WebChat 前端
│   │   └── public/
│   │       ├── index.html           # 主页面
│   │       └── app.js               # 前端逻辑
│   │
│   └── browser-extension/           # Chrome 扩展 (MV3)
│       └── background.js            # chrome.debugger 桥接
│
└── ~/.belldandy/                    # 用户工作空间
    ├── SOUL.md                      # 核心人格
    ├── IDENTITY.md                  # 身份设定
    ├── USER.md                      # 用户档案
    ├── MEMORY.md                    # 长期记忆
    ├── HEARTBEAT.md                 # 定时任务
    ├── mcp.json                     # MCP 服务器配置
    ├── logs/                        # 运行日志 (按日期+大小轮转，Agent 可读取)
    ├── memory/                      # 每日笔记
    ├── methods/                     # SOP 方法论
    ├── skills/                      # 用户自定义工具
    └── plugins/                     # 用户插件
```

---

## 快速开始

### 环境要求

- **操作系统**：Windows / macOS / Linux
- **Node.js**：版本 **22.12.0** 或更高（推荐 LTS）
- **包管理器**：`pnpm`（项目已启用 corepack 自动管理）

### 一键启动（推荐）

**Windows**：双击项目目录下的 `start.bat`

**macOS / Linux**：
```bash
./start.sh
```

脚本会自动：检查环境 → 安装依赖 → 启动服务 → 打开浏览器

### 手动启动

```bash
# 1. 进入项目目录
cd Belldandy

# 2. 安装依赖
corepack pnpm install

# 3. 启动 Gateway
corepack pnpm dev:gateway

# 4. 打开浏览器访问
# http://localhost:28889/
```

### 首次配对

为了安全，首次使用需要配对：

1. 在 WebChat 发送消息，界面会提示配对码（如 `ABC123XY`）
2. 在终端执行批准命令：
   ```bash
   corepack pnpm pairing:approve ABC123XY
   ```
3. 再次发送消息即可正常对话

---

## 功能特性

### ✅ 已完成

| 模块 | 功能 | 说明 |
|------|------|------|
| **基础架构** | Gateway + WebChat | WebSocket 实时通信、流式回复、Markdown 渲染 |
| **安全准入** | Pairing 配对机制 | 基于 ClientId 的白名单，防止未授权访问 |
| **工具系统** | Skills | `web_fetch`、`file_read/write`、`list_files`、`apply_patch`、`log_read`、`log_search` |
| **记忆系统** | Hybrid RAG | SQLite FTS5 + sqlite-vec 向量混合检索 |
| **人格系统** | SOUL | 可配置的 AI 性格、身份、用户档案 |
| **插件系统** | 13 种生命周期钩子 | HookRegistry + HookRunner + 优先级 |
| **浏览器控制** | Browser Extension | 截图、快照、点击、输入、自动化操作 |
| **系统执行** | Safe Mode | 安全的 Shell 命令执行（严格白名单） |
| **多媒体** | TTS + 图像生成 | Edge TTS 免费语音、DALL-E 3 图像 |
| **视觉感知** | Loopback Vision | 通过摄像头让 Agent "看到"世界 |
| **方法论** | SOP 沉淀 | Agent 自我进化与经验复用 |
| **MCP 支持** | Model Context Protocol | 连接外部 MCP 服务器，扩展工具生态 |
| **渠道** | 飞书 + Channel 接口 | 可扩展的多渠道架构 |

---

## 配置指南

在项目根目录创建 `.env.local` 文件（Git 会自动忽略）。
可以参考仓库中的 `.env.example` 填写必需的配置项。

### 基础配置（必选）

```env
# 启用 OpenAI 协议 Provider
BELLDANDY_AGENT_PROVIDER=openai

# API 服务地址
BELLDANDY_OPENAI_BASE_URL=https://api.openai.com/v1
# 或 Gemini: https://generativelanguage.googleapis.com/v1beta/openai
# 或本地 Ollama: http://127.0.0.1:11434/v1

# API Key
BELLDANDY_OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx

# 模型名称
BELLDANDY_OPENAI_MODEL=gpt-4o
```

> **💡 也可以在网页界面设置**：启动后点击右上角 ⚙️ 图标，可视化修改配置并自动重启。

### 进阶配置（可选）

```env
# ------ 网络与安全 ------
BELLDANDY_PORT=28889                    # 服务端口
BELLDANDY_AUTH_MODE=none                # none | token | password

# ------ AI 能力 ------
BELLDANDY_TOOLS_ENABLED=true            # 启用工具调用
BELLDANDY_EMBEDDING_ENABLED=true        # 启用记忆检索
BELLDANDY_EMBEDDING_MODEL=text-embedding-004

# ------ 心跳任务 ------
BELLDANDY_HEARTBEAT_ENABLED=true        # 定期检查 HEARTBEAT.md
BELLDANDY_HEARTBEAT_INTERVAL=30m        # 支持 30m, 1h, 300s
BELLDANDY_HEARTBEAT_ACTIVE_HOURS=08:00-23:00  # 深夜不打扰

# ------ 浏览器 ------
BELLDANDY_BROWSER_RELAY_ENABLED=true    # 自动启动浏览器中继

# ------ MCP 支持 ------
BELLDANDY_MCP_ENABLED=true              # 启用 MCP 协议支持

# ------ 日志系统 ------
BELLDANDY_LOG_LEVEL=debug               # 最低日志级别 (debug/info/warn/error)
BELLDANDY_LOG_DIR=~/.belldandy/logs     # 日志目录，默认 ~/.belldandy/logs
BELLDANDY_LOG_MAX_SIZE=10MB             # 单文件最大大小，超过则轮转
BELLDANDY_LOG_RETENTION_DAYS=7          # 日志保留天数，超过自动清理
BELLDANDY_LOG_CONSOLE=true              # 是否输出到控制台
BELLDANDY_LOG_FILE=true                 # 是否写入文件
```

### MCP 配置

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 是一个标准化协议，用于 AI 助手连接外部数据源和工具。

在 `~/.belldandy/mcp.json` 中配置 MCP 服务器：

```json
{
  "version": "1.0.0",
  "servers": [
    {
      "id": "filesystem",
      "name": "文件系统",
      "description": "提供文件系统访问能力",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
      },
      "autoConnect": true,
      "enabled": true
    },
    {
      "id": "github",
      "name": "GitHub",
      "description": "GitHub API 访问",
      "transport": {
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
        }
      },
      "autoConnect": true,
      "enabled": true
    }
  ],
  "settings": {
    "defaultTimeout": 30000,
    "debug": false,
    "toolPrefix": true
  }
}
```

**支持的传输类型**：
- `stdio`：本地子进程通信（推荐，适用于大多数 MCP 服务器）
- `sse`：HTTP Server-Sent Events（适用于远程服务器）

**常用 MCP 服务器**：
- `@modelcontextprotocol/server-filesystem` - 文件系统访问
- `@modelcontextprotocol/server-github` - GitHub API
- `@modelcontextprotocol/server-sqlite` - SQLite 数据库
- `@modelcontextprotocol/server-puppeteer` - 浏览器自动化

> 💡 启用 MCP 需要同时启用工具系统（`BELLDANDY_TOOLS_ENABLED=true`）

---

## 个性化定制

Belldandy 的数据存储在 `~/.belldandy/` 目录下。

### 人格塑造

| 文件 | 用途 | 示例 |
|------|------|------|
| `SOUL.md` | 核心性格 | "你是一个严谨的 TypeScript 专家..." |
| `IDENTITY.md` | 身份设定 | "你的名字叫 Belldandy，是一级神..." |
| `USER.md` | 用户档案 | "用户叫 vrboyzero，全栈工程师..." |

### 记忆系统

| 路径 | 用途 |
|------|------|
| `MEMORY.md` | 长期记忆（核心事实） |
| `memory/YYYY-MM-DD.md` | 每日流水笔记 |

### 定时提醒

编辑 `HEARTBEAT.md`：
```markdown
- [ ] 每天早上提醒我查看日程
- [ ] 喝水提醒
```

### 日志系统

运行日志保存在 `~/.belldandy/logs/` 目录，支持：

| 特性 | 说明 |
|------|------|
| **双输出** | 同时输出到控制台和文件 |
| **按日期分文件** | 如 `gateway-2025-02-05.log` |
| **按大小轮转** | 单文件超过 10MB 自动切分 |
| **自动清理** | 超过保留天数（默认 7 天）的日志自动删除 |
| **Agent 可读** | Agent 可通过 `log_read`、`log_search` 工具回溯日志，理解任务执行情况 |

环境变量见 [进阶配置](#进阶配置) 中的 `BELLDANDY_LOG_*` 配置项。

---

## 飞书对接

让 Belldandy 通过飞书与你对话——无需公网 IP！

### 1. 创建飞书应用

1. 登录 [飞书开放平台](https://open.feishu.cn/)
2. 点击 **"开发者后台"** → **"创建企业自建应用"**
3. 填写应用信息并创建

### 2. 获取凭证

在应用详情页的 **"凭证与基础信息"** 中记录：
- **App ID**
- **App Secret**

### 3. 配置权限与机器人

1. **开启机器人**：应用功能 → 机器人 → 启用
2. **申请权限**：开发配置 → 权限管理 → 开通：
   - `im:message`（获取消息）
   - `im:message:send_as_bot`（发送消息）
   - `im:resource`（获取资源）
3. **配置长连接**：开发配置 → 事件订阅 → 选择"长连接模式" → 添加 `im.message.receive_v1` 事件
4. **发布应用**：应用发布 → 版本管理 → 创建版本 → 申请发布

### 4. 配置 Belldandy

在 `.env.local` 中添加：
```env
BELLDANDY_FEISHU_APP_ID=cli_xxxxxxxxxxxxxxxx
BELLDANDY_FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 5. 启动使用

```bash
corepack pnpm dev:gateway
```

看到 `Feishu WebSocket Channel started.` 和 `ws client ready` 即连接成功。打开飞书搜索应用名称开始对话！

---

## 高级功能

### 浏览器自动化

让 Agent 控制浏览器打开网页、截图、提取内容。

1. **启用中继**：在 `.env.local` 添加 `BELLDANDY_BROWSER_RELAY_ENABLED=true`
2. **安装扩展**：
   - 打开 `chrome://extensions`
   - 开启"开发者模式"
   - 点击"加载已解压的扩展程序"
   - 选择 `apps/browser-extension` 目录
3. **连接**：点击浏览器工具栏的扩展图标，显示 Connected 即可

### 语音交互

支持免费高质量的 Edge TTS（微软晓晓/云希）。

- **开启**：对 Agent 说"开启语音模式"
- **关闭**：对 Agent 说"关闭语音"

### 视觉感知

让 Agent 通过摄像头"看到"世界。

- 前提：已完成浏览器自动化连接
- 使用：对 Agent 说"拍张照"或"看看我现在在哪"

### 插件系统

支持 13 种生命周期钩子：

| 类别 | 钩子 |
|------|------|
| Agent | `before_agent_start`, `agent_end`, `before_compaction`, `after_compaction` |
| 消息 | `message_received`, `message_sending`, `message_sent` |
| 工具 | `before_tool_call`, `after_tool_call`, `tool_result_persist` |
| 会话 | `session_start`, `session_end` |
| 网关 | `gateway_start`, `gateway_stop` |

插件放到 `~/.belldandy/plugins/` 目录，Gateway 启动时自动加载。

---

## 管理命令

```bash
# 查看已授权设备
corepack pnpm pairing:list

# 查看待批准请求
corepack pnpm pairing:pending

# 批准配对
corepack pnpm pairing:approve <CODE>

# 撤销授权
corepack pnpm pairing:revoke <CLIENT_ID>

# 清理过期请求
corepack pnpm pairing:cleanup

# 备份与恢复
corepack pnpm pairing:export --out backup.json
corepack pnpm pairing:import --in backup.json
```

---

## 常见问题

**Q: 启动时提示 `EADDRINUSE` 端口被占用？**

A: 修改 `.env.local` 中的端口：`BELLDANDY_PORT=28890`

**Q: 如何从外网访问？**

A: 使用 Cloudflare Tunnel 或 Frp 等内网穿透工具，并开启 `BELLDANDY_AUTH_MODE=token`

**Q: 记忆检索不准？**

A: 确保配置了 Embedding 模型且 `BELLDANDY_EMBEDDING_ENABLED=true`

**Q: Windows 下可以执行 CMD 命令吗？**

A: 可以。已支持 `copy`, `move`, `del`, `ipconfig` 等原生命令。注意 `del` 禁止 `/s`、`/q` 参数。

**Q: 飞书发送消息后不回复？**

A: 检查：
1. 应用已发布且审核通过
2. 权限已正确开通
3. 已添加 `im.message.receive_v1` 事件订阅

---

## 项目结构

```
packages/
├── belldandy-core/      # Gateway、协议、配置、安全策略
├── belldandy-agent/     # Agent 运行时、工具编排、流式输出
├── belldandy-channels/  # 渠道接口（飞书、Telegram 等）
├── belldandy-skills/    # Skills 定义与执行
├── belldandy-memory/    # 记忆索引与检索
├── belldandy-plugins/   # 插件系统
└── belldandy-browser/   # 浏览器自动化

apps/
├── web/                 # WebChat 前端
└── browser-extension/   # Chrome 扩展
```

---

## 开发者信息

### 参考项目

本项目参考 [moltbot](https://github.com/moltbot/moltbot) 架构设计，代码完全重写。

### 相关文档

- [PRD.md](./PRD.md) - 产品需求文档
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) - 实施计划与里程碑
- [Belldandy实现内容说明.md](./Belldandy实现内容说明.md) - 详细功能说明
- [Belldandy使用手册.md](./Belldandy使用手册.md) - 完整使用指南

---

## 赞助支持

如果 Belldandy 对你有帮助，欢迎请作者喝杯咖啡 ☕

开发和维护开源项目需要投入大量时间和精力，你的支持是我持续更新的动力！

### 爱发电

[![爱发电](https://img.shields.io/badge/爱发电-支持作者-946ce6?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyIDIxLjM1bC0xLjQ1LTEuMzJDNS40IDE1LjM2IDIgMTIuMjggMiA4LjUgMiA1LjQyIDQuNDIgMyA3LjUgM2MxLjc0IDAgMy40MS44MSA0LjUgMi4wOUMxMy4wOSAzLjgxIDE0Ljc2IDMgMTYuNSAzIDE5LjU4IDMgMjIgNS40MiAyMiA4LjVjMCAzLjc4LTMuNCA2Ljg2LTguNTUgMTEuNTRMMTIgMjEuMzV6Ii8+PC9zdmc+)](https://afdian.com/a/vrboyzero777)

👉 [https://afdian.com/a/vrboyzero777](https://afdian.com/a/vrboyzero777)

### 微信 / 支付宝

<p align="center">
  <img src="./assets/wechat.png" alt="微信收款码" width="200">
  &nbsp;&nbsp;&nbsp;&nbsp;
  <img src="./assets/alipay.jpg" alt="支付宝收款码" width="200">
</p>

感谢每一位支持者！🙏

---

## 联系方式

- **Email**：[fyyx4918822@gmail.com](mailto:fyyx4918822@gmail.com)
- **QQ 群**：1080383003
- **问题反馈**：[GitHub Issues](https://github.com/vrboyzero/Belldandy/issues)

欢迎交流、反馈 Bug 或提出建议！

---

## License

MIT

---

<p align="center">
  <em>Belldandy - Your Personal AI Assistant</em>
</p>
