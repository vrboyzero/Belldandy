# OpenClaw VS Belldandy 实现对比说明

> 说明：本文件以 **OpenClaw 已实现能力** 为主线，对照 **Belldandy** 当前的实现情况，标注「已对齐 / 部分对齐 / 未实现」及对应模块，方便后续按功能补齐能力。
>
> 截止版本：以 `Belldandy 实现内容说明.md`、`README.md`、OpenClaw `README.md` 及仓库结构为依据。

---

## 对比标记说明

- **✅ 已对齐**：Belldandy 已有与 OpenClaw 等价或非常接近的实现，能完成类似任务。
- **⚠️ 部分对齐**：Belldandy 在该方向已有实现，但能力范围/生态/UX 与 OpenClaw 有明显差距。
- **❌ 未实现**：当前文档与代码结构中未发现对应能力，或仍停留在规划阶段。

---

## 1. 核心平台与 Gateway / CLI（控制平面）

| 能力项 | OpenClaw 实现（摘自 README/代码） | Belldandy 对应实现 | 状态 |
|--------|------------------------------------|--------------------|------|
| 本地优先 Gateway 控制平面 | `src/gateway/*` 提供 WebSocket Gateway，统一管理会话、渠道、工具、事件，以及 Control UI / WebChat / Canvas Host | `packages/belldandy-core/server.ts` 提供基于 WebSocket 的 Gateway，统一处理客户端连接、鉴权与消息路由，并托管 WebChat 页 | ✅ 已对齐 |
| CLI 入口与命令树 | `src/index.ts` 作为 `openclaw` CLI 入口，`src/cli/*` + `src/commands/*` 覆盖 gateway/agent/send/onboard/doctor/update 等命令 | `pnpm dev:gateway` + 后续 CLI 计划以 `@belldandy/*` 包为中心，目前已有 pairing 管理命令（`pairing:*`）及部分工具命令；尚未形成完整的 `openclaw` 级别命令树 | ⚠️ 部分对齐（核心命令少） |
| 本地 Web UI / WebChat | Gateway 直接提供 Web 控制台与 WebChat（`docs/web`，`src/web` + UI 构建），作为统一管理入口 | `apps/web` 提供 WebChat，具备实时流式对话、配置面板、System Doctor 等，并由 Gateway 静态服务 | ✅ 已对齐 |
| Onboarding Wizard | `openclaw onboard` CLI 向导，涵盖 gateway、workspace、channels、skills 安装和配置 | Belldandy 尚无统一 CLI 向导，主要依赖文档引导 + Web 设置面板；飞书对接、MCP 等通过文档手动配置 | ❌ 未实现 |
| Doctor / 健康检查 | `openclaw doctor` + `docs/gateway/doctor`，检查通道、模型配置、版本、更新等 | 已实现 `system.doctor` 协议与 System Doctor 面板（检查 Node 版本、向量 DB、Agent Config、心跳等），通过 Web UI 暴露 | ⚠️ 部分对齐（偏向单机自检，尚无多通道/多节点体检） |
| 配置读取/更新 | Gateway 通过配置系统（`src/config/*`）+ CLI `config` 命令读写 YAML/JSON/TOML 配置 | `config.read` / `config.update` RPC 读写 `.env.local`，配合 Web 配置面板，实现在线编辑和自动重启 | ⚠️ 部分对齐（Belldandy 以 .env 为主，尚未有多 profile/remote 配置） |
| 远程 Gateway / Tailscale | 支持在远程 Linux 上运行 Gateway，并通过 Tailscale Serve/Funnel、SSH 隧道、Nix/Docker 集成远程访问 | Belldandy 当前定位为本地优先桌面运行，文档中未涉及远程 Gateway 暴露与 Tailscale/Nix 等运维方案 | ❌ 未实现 |

---

## 2. 会话模型与多 Agent 编排

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| 会话模型（Session Model） | `src/gateway/session-utils*` + `docs/concepts/session`：支持 main / group / queue modes，session pruning，group rules 等 | `ConversationStore` 提供内存会话管理，带 TTL 与最大历史长度；支持分层 Prompt（System/History/User）防注入 | ⚠️ 部分对齐（Belldandy 会话模型较简化） |
| 多 Agent 路由 | README 中的 multi-agent routing：可按 channel/account/peer 路由到不同 agents/workspaces | Belldandy 当前聚焦单主 Agent（SOUL + USER），尚未提供多 Agent 路由/多 workspace 机制 | ❌ 未实现 |
| Agent Runtime（工具流 + block 流） | Pi agent runtime（RPC 模式）、tool streaming / block streaming，支持 session 级配置 | `@belldandy/belldandy-agent` 提供 ToolEnabledAgent，支持 ReAct 工具循环、hook 系统、System Prompt 构建等 | ⚠️ 部分对齐（流式工具事件、block 流模式细节不同） |
| Session 间编排工具 | `sessions_list` / `sessions_history` / `sessions_send` 等工具，支持 Agent to Agent 协作、跨会话消息 | Belldandy 规划中有“Session 编排”方向，但当前工具集中未提供 `sessions_*` 级别的跨会话编排能力 | ❌ 未实现 |
| Heartbeat 与 Session 交互 | Gateway + cron 可主动唤醒 Agent 执行任务，与 session 工具联动 | Heartbeat Runner 定期读取 `HEARTBEAT.md` 并主动与主会话交互；心跳内可利用 Memory/Methods/Skills 执行任务 | ⚠️ 部分对齐（Belldandy 主要基于 heartbeat，不含通用 cron/sessions_* 协同） |

---

## 3. 渠道（Channels）与消息路由

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| 多渠道收件箱 | 支持 WhatsApp、Telegram、Slack、Discord、Google Chat、Signal、BlueBubbles、iMessage、Microsoft Teams、Matrix、Zalo、Zalo Personal、WebChat 等众多渠道（部分在 `src/channels/*`，部分在 `extensions/*`） | 当前正式支持 **飞书** 渠道，通过 `belldandy-channels` 中的通用 `Channel` 接口 + `FeishuChannel` 实现 WebSocket 双向通信 | ⚠️ 部分对齐（架构已对标，但渠道数量较少） |
| Channel 抽象与管理 | `src/channels/*` 定义 channel-config、allowlists、gating、registry；`extensions/*` 承载扩展渠道；文档有完整 Channel 规则 | `packages/belldandy-channels` 提供 `Channel` 接口、`ChannelManager` 管理器及飞书实现；未来可快速接入 Telegram/Slack/Discord 等 | ✅ 已对齐（接口对标，生态待扩展） |
| DM Pairing 安全策略 | 多渠道统一的 DM pairing 策略（dmPolicy="pairing" / allowFrom），配合 `openclaw pairing approve` 管理本地 allowlist | Belldandy 已实现基于 ClientId 的 Pairing 配对机制（CLI：`pairing:list/approve/cleanup/export/import`），并在 Feishu 渠道中按 Channel 接口适配 | ✅ 已对齐 |
| Group routing / Mention gating | 对群消息的 mention gating、reply tags、channel chunking/routing（docs: Groups/Channels） | Belldandy 暂未强调复杂群聊路由规则，AGENTS/TOOLS 文档有群聊行为准则，但未实现 per-channel 级 mention gating 引擎 | ⚠️ 部分对齐（策略在人格/文档层，路由引擎待强化） |
| WebChat 渠道 | WebChat 作为一个标准渠道，纳入 Gateway 路由体系 | WebChat 是 Belldandy 的主入口之一，与 Gateway 紧密集成，支持配对、配置面板、System Doctor 等 | ✅ 已对齐 |

---

## 4. Apps & Nodes（macOS/iOS/Android 节点）

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| macOS 控制平面 App | `apps/macos` SwiftUI 菜单栏应用，整合 Voice Wake、Talk Mode、WebChat、远程 Gateway 控制等 | Belldandy 暂无原生桌面 App，以浏览器 WebChat + 本地 Node.js 服务为主 | ❌ 未实现 |
| iOS/Android Nodes | `apps/ios`、`apps/android` 提供移动端节点，支持 Canvas、VoiceWake、Talk Mode、camera、screen record 等，并通过 Gateway node 协议汇报能力 | Belldandy 当前主要依赖浏览器与本机环境，未提供移动端原生 Node 应用 | ❌ 未实现 |
| Node 模式与权限映射 | macOS app 可以以 node 模式运行，借由 `node.list/describe/invoke` 暴露 `system.run`、`system.notify`、camera/screen/location 等能力，并遵守 TCC 权限 | Belldandy 尚未引入 node 层抽象，系统命令/摄像头等能力直接在主进程或浏览器中实现 | ❌ 未实现 |
| 远程 Gateway + 本地 Node 协同 | 支持 Gateway 在 Linux 上运行，而设备节点在 macOS/iOS/Android，节点通过 Gateway 执行本地操作 | Belldandy 当前定位为“同机运行”，未强调远程 Gateway + 本地 Node 的分布式架构 | ❌ 未实现 |

---

## 5. 工具 / Skills 与自动化

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| Skills 平台（工具体系） | `skills/` 目录下大量技能（1Password/GitHub/Slack/Spotify/Notion 等），配合 `plugin-sdk`、ClawHub 技能注册表自动发现与安装 | `@belldandy/belldandy-skills` 提供工具系统，内置 `web_fetch`、`file_read/write/delete`、`list_files`、`apply_patch`、`web_search`、`system`（Safe Mode）、`browser`、`memory`、`log`、`multimedia`、`methodology`、`session` 等；工作空间可以自定义 skills | ⚠️ 部分对齐（核心工具齐全，生态数量相对少，暂无公共技能注册中心） |
| 文件操作工具 | `read_file_content`、`write_file`、`edit_file`、`apply_patch` 等工具在 agent 工具集中广泛使用 | 完整对标：`file_read`、`file_write`、`file_delete`、`list_files`、`apply_patch_dsl`，并对路径、敏感文件做策略限制 | ✅ 已对齐 |
| System 执行工具 | `exec` / `process` 工具执行 shell 命令、管理长运行进程，结合 sandbox/policy 控制风险 | Belldandy 实现 `run_command`（Safe Mode）和 `process_manager`，有白名单、危险命令拦截、参数检查等 Consumer Safe Mode 设计 | ✅ 已对齐（安全策略甚至更保守） |
| 浏览器工具集 | `browser` 工具族：status/start/stop/tabs/open/focus/close/snapshot/screenshot/pdf/act/console/upload/dialog 等 | Belldandy `browser_*` 工具族：`browser_open/navigate/status/snapshot/screenshot/action` 等，依托浏览器中继与 DOM 快照，能力覆盖页面控制主闭环 | ⚠️ 部分对齐（功能覆盖接近，细粒度 action/console/upload 对齐情况略有差异） |
| Web & Search | `web_search`、`web_fetch` 等轻量网络工具 | `web_search` + `web_fetch` 已实现，带域名白/黑名单、SSRF 防护与大小/超时限制 | ✅ 已对齐 |
| 多媒体工具 | `tts`、`image`、`canvas` 等多媒体工具 | Belldandy 已实现多 Provider 的 TTS（Edge/OpenAI）、图像生成/识别工具，并规划/实现 Loopback Vision；Canvas 类绘图工具尚未开放 | ⚠️ 部分对齐（缺少 canvas 绘图） |
| 会话与编排工具 | `agents_list`、`sessions_*`、`cron` 等工具帮助 orchestrate 多 Agent、多任务 | Belldandy 已有 Methodology + Heartbeat 体系，但缺少对外暴露的 `agents_list` / `sessions_spawn` / 通用 `cron` 工具 | ❌ 未实现 |
| 技能注册中心 | ClawHub 作为技能 registry，支持 agent 在需要时自动搜索/安装新技能 | Belldandy 暂未提供类似在线技能仓库，技能扩展依赖用户在本地添加 packages/skills | ❌ 未实现 |

---

## 6. 记忆（Memory）与存储

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| 本地向量数据库 | 使用 `node:sqlite` + `sqlite-vec` 构建本地向量数据库，支持高效 KNN 检索 | `belldandy-memory` 使用 SQLite + FTS5 + `sqlite-vec`，实现混合检索（BM25 + 语义向量），并有 rowid 映射与 vec0 虚拟表 | ✅ 已对齐 |
| 文本分块与索引 | `chunker` / indexer 组件按大小/语义分块，并增量索引文件 | `Chunker` + `MemoryIndexer` 支持 Token 估算分块、增量索引 `~/.belldandy/memory/` 目录，包含 auto cleanup | ✅ 已对齐 |
| 记忆分层结构 | OpenClaw 文档侧重 sessions + nodes + skills，对“长期/短期”记忆分层在 docs 中有说明 | Belldandy 形成完整的 **每日/每周/每月/长期** 记忆分层（`memory/YYYY-MM-DD.md`、`YYYY-Www.md`、`YYYY-MM.md`、`MEMORY.md`），并在 HEATBEAT 中说明整合流程 | ✅ 已对齐（结构更细致） |
| Memory 工具 | 提供 memory/nodes 工具族（含知识图谱节点等） | Belldandy 提供 `memory_search`、`memory_read`、`memory_write` 等工具，但缺少 `nodes` 类知识图谱管理工具 | ⚠️ 部分对齐（节点图谱未实现） |
| 实时文件感知 | 文件变化触发增量索引，保持记忆新鲜 | Belldandy 已实现 Watcher + 增量索引 + Auto Cleanup，1 秒内更新 Memory 数据库 | ✅ 已对齐 |

---

## 7. 浏览器控制、Canvas 与视觉能力

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| 浏览器控制 | `tools/browser` 提供对 Chrome/Chromium 的全套 CDP 控制（snapshots/actions/uploads/profiles 等） | Belldandy 实现 Browser Relay Server + Chrome Extension（MV3 + `chrome.debugger`），并通过一组 `browser_*` 工具控制真实浏览器 | ✅ 已对齐 |
| DOM 快照 | `snapshot` 返回 AI 友好的页面结构（a11y tree）供 Agent 解析 | Belldandy 实现「交互式 DOM 快照」，过滤噪音、分配数字 ID，显著降低 token 消耗 | ✅ 已对齐 |
| Canvas / A2UI | Live Canvas + A2UI 视觉工作区，支持 push/reset/eval/snapshot 等操作 | Belldandy 当前未实现独立 Canvas / A2UI 系统，重点在 WebChat 与浏览器控制上 | ❌ 未实现 |
| 视觉感知（Loopback Vision） | 通过 nodes/camera/screen-record 实现多终端视觉捕获 | Belldandy 实现 Loopback Vision：`/mirror.html` + browser_navigate + browser_screenshot 组合，通过摄像头画面实现视觉感知 | ⚠️ 部分对齐（依赖浏览器页面，不含多节点摄像头体系） |

---

## 8. 定时任务 / Cron / Heartbeat

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| Cron Jobs | `docs/automation/cron-jobs` + Gateway cron 子系统，支持多种定时任务与 webhooks | Belldandy 当前主要依赖 Heartbeat Runner（定期轮询 `HEARTBEAT.md`）作为“软 Cron”，每轮可以执行一批任务 | ⚠️ 部分对齐（缺少通用 Cron 配置与多 Job 管理） |
| Webhooks / Gmail PubSub | 支持 webhook / Gmail PubSub 触发 Gateway 任务 | Belldandy 文档中暂未提及 Webhook / Gmail PubSub 类外部事件触发机制 | ❌ 未实现 |
| 心跳机制 | Gateway cron 与会话工具深度结合，可触发 nodes/skills 等多种操作 | Belldandy Heartbeat Runner 已实现定时触发、活跃时段、`HEARTBEAT_OK`、HEARTBEAT.md 解析等并对标 moltbot 心跳能力 | ✅ 已对齐 |

---

## 9. MCP / 外部扩展生态

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| ACP / Agent Client Protocol Bridge | `src/acp/*` + `docs.acp.md`：`openclaw acp` 将 ACP 会话桥接到 Gateway Session，适配 IDE（Zed 等） | Belldandy 侧目前未实现 ACP Bridge，而是直接通过本地 Gateway + WebChat/CLI 交互；IDE 集成路径尚未标准化 | ❌ 未实现（走 MCP 而非 ACP 路线） |
| MCP 支持 | OpenClaw 目前以自有工具/skills/插件为主，未突出 MCP 协议 | Belldandy 已实现独立 `@belldandy/mcp` 包，支持 stdio/SSE 传输、多服务器管理、工具桥接（MCP 工具 → Skills），并通过 env 启用 | ✅ Belldandy 领先（原生 MCP 客户端） |
| 技能/插件生态 | OpenClaw 拥有大量官方 skills/扩展（skills/ + extensions/ + ClawHub registry），覆盖 1Password/GitHub/Spotify/Notion/Slack 等 | Belldandy 当前 skills 以本地工具 + 方法论为主，第三方服务接入以 MCP 服务器方式为主（例如 filesystem 等），尚未形成类似 ClawHub 的公共 registry | ⚠️ 部分对齐 |

---

## 10. 安全、防护与日志运维

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| DM 安全与 Pairing | 多渠道统一 DM pairing 策略，allowFrom/dmPolicy + `openclaw pairing approve` | Pairing 机制 + `allowlist.json`，提供 CLI 管理配对请求，配合飞书渠道与 workspace 安全策略 | ✅ 已对齐 |
| 工具调用安全策略 | 工具执行基于 policy + sandbox，依托 docker/nodes 进行隔离，敏感命令需显式允许 | Belldandy 强调 Consumer Safe Mode：白名单命令、危险命令和参数封禁、SSRF 防护、敏感路径 denyList、日志脱敏等；在 `Belldandy 实现内容说明` 中有完整安全路线图 | ✅ 已对齐（策略更细化） |
| 日志系统 | Gateway/logging 子系统，提供 logging 文档与 ops 支持 | `belldandy-core/logger` 实现文件日志 + 控制台输出 + 轮转 + 自动清理，Agent 可通过 `log_read`/`log_search` 访问日志，并与 Methods 深度集成 | ✅ 已对齐（并与方法论协同） |
| 安全文档与 Roadmap | Security 文档详述部署、Tailscale、权限等 | Belldandy 在实现说明中列出 P0–P3 安全问题与建议（workspace.read 泄漏、AUTH_MODE 默认 none、config.read/update 脱敏、MCP 工具边界、web_fetch SSRF、browser 域名控制等） | ⚠️ 部分对齐（安全建议已列出，部分改动待落地） |

---

## 11. 部署、打包与运维工具

| 能力项 | OpenClaw 实现 | Belldandy 对应实现 | 状态 |
|--------|----------------|--------------------|------|
| 全平台安装与打包 | 支持 npm 全局安装、pnpm/bun、本地编译 `dist/`，并有 macOS 打包脚本、Dockerfile、Nix 支持 | Belldandy 提供 `start.sh`/`start.bat` 一键脚本（检查环境 → 安装依赖 → 启动服务 → 打开浏览器），支持标准 pnpm dev 流程；暂未提供 Docker/Nix/macOS 打包 | ⚠️ 部分对齐 |
| 远程部署与运维 | 文档覆盖 Remote Gateway、Tailscale Serve/Funnel、SSH 隧道、Linux 实例部署等 | Belldandy 当前定位为本地运行，未提供远程部署/运维专用文档与脚本 | ❌ 未实现 |
| CI/PR 流程 | 提供 `scripts/committer`、PR 流程、Clawdbot 等自动化 | Belldandy 仓库目前主要聚焦功能实现，CI/PR 自动化程度相对较低，尚未引入类似 Clawdbot 的专用 bot | ❌ 未实现 |

---

## 总体结论（供规划使用）

- **高度对齐领域**：
  - 本地优先 Gateway + WebChat、Pairing 安全、文件/浏览器/系统执行工具、记忆系统（SQLite + sqlite-vec）、SOUL 人格/Workspace 文件体系、Heartbeat 心跳、方法论系统、日志系统、MCP 支持等。
- **部分对齐但可继续演进的领域**：
  - 渠道数量（多平台 IM）、多 Agent 编排（sessions_*）、通用 Cron / Webhook 触发、第三方 skills 生态、Canvas / 多节点视觉体系、安全路线图中的细节改造、远程 Gateway 运维与打包。
- **OpenClaw 显著领先的领域**：
  - 多平台渠道矩阵（Slack/Discord/Telegram/WhatsApp 等）、Apps & Nodes（macOS/iOS/Android 原生节点）、ClawHub 技能注册中心、多 Agent 会话编排、Tailscale+Docker+Nix 的运维与部署工具链。
- **Belldandy 具备自身独特优势的领域**：
  - 方法论（Methods）+ Logs + Memory 的闭环设计、面向“可赚钱流水线”的长期 Agent 策略、极致 UI 体验（Ethereal Design）、MCP 原生集成以及安全默认值（Safe Mode、防注入、workspace 结构化管理）。
