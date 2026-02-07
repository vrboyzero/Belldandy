# Belldandy 实现内容说明

本文档详细介绍了 Belldandy 项目已完成的功能模块及后续规划，旨在帮助开发者和使用者深入理解系统设计与能力。同时，为了方便对比与参考，附录部分详细列出了参考目标 **openclawt** 的完整能力清单。

## ✅ 已完成功能模块

### 1. 基础架构与 WebChat (Phase 1-2)

- **目标**：搭建最小可用、端到端的实时对话系统闭环。
- **实现内容**：
    - **Gateway**：基于 WebSocket 的消息总线，处理客户端连接、鉴权与消息路由。
    - **Agent Runtime**：支持流式输出（Streaming）的 Agent 运行环境，默认集成 MockAgent（本地测试）与 OpenAI 协议兼容 Provider。
    - **WebChat**：轻量级 Web 前端，支持自动重连、Markdown 渲染、实时消息流展示。
    - **协议**：定义了 `message.send`、`chat.delta`、`chat.final` 等标准事件格式。
- **价值**：作为系统的骨架，确保了“输入-处理-输出”核心链路的稳定与即时响应。

### 2. 安全准入与 Pairing 机制 (Phase 3 & 3.1)

- **目标**：遵循“默认安全”原则，保护 Agent 不被未授权的设备或用户访问。
- **实现内容**：
    - **强制配对**：所有未知来源的连接请求会被拒绝，并触发 Pairing 流程。
    - **Allowlist**：基于 ClientId 的白名单机制，只有授权设备才能与 Agent 对话。
    - **CLI 管理工具**：提供了全套命令行工具管理授权：
        - `pairing:list` / `pairing:pending`：查看授权状态与待处理请求。
        - `pairing:approve <CODE>`：批准配对请求。
        - `pairing:cleanup`：一键清理过期的请求。
        - `pairing:export` / `pairing:import`：配置数据的备份与恢复。
- **价值**：确保个人 AI 助手的私密性，防止被局域网内的其设备意外调用或恶意扫描。

### 3. Skills 工具系统 (Phase 4)

- **目标**：赋予 Agent 操作外部世界的能力，突破 LLM 的知识截止限制。
- **实现内容**：
    - **工具沙箱**：`@belldandy/skills` 包提供了安全的工具执行环境与审计日志功能。
    - **内置工具**：
        - `web_fetch`：受控的网页抓取工具（含域名白/黑名单、内网 IP 阻断、超时与大小限制）。
        - `file_read` / `file_write`：受控的文件读写工具（防目录遍历、敏感文件黑名单、显式写入许可）。
    - **Function Calling**：实现了 `ToolEnabledAgent`，支持“思考-调用工具-获取结果-再思考”的 ReAct 循环。
- **价值**：让 Agent 可以联网搜索最新信息、阅读本地文档、甚至协助编写代码文件，极大地扩展了其实用性。

### 4. Memory 记忆系统 (Phase 4 & 4.5)

- **目标**：赋予 Agent 长期记忆，使其随着使用越来越了解用户，并能回忆起过去的对话与知识。
- **实现内容**：
    - **混合检索内核**：基于 SQLite 实现，结合了 **FTS5 关键词检索**（BM25）与 **`sqlite-vec` 向量语义检索**（Native C++ KNN）。
    - **智能索引**：
        - `Chunker`：基于 Token 估算的智能文本分块。
        - `MemoryIndexer`：增量式文件索引，自动扫描 `~/.belldandy/memory/` 目录。
    - **物理分层存储**：
        - **数据库层**：SQLite 中 `chunks` 表新增 `memory_type` 字段 (`core` | `daily` | `other`)，实现物理隔离与差异化检索。
        - **文件映射**：
            - `MEMORY.md` ➜ `core` (长期记忆/事实)
            - `memory/YYYY-MM-DD.md` ➜ `daily` (短期流水/日志)
    - **Embedding 集成**：支持对接 OpenAI 兼容的 Embedding API 生成向量。
    - **Memory Tools**：提供了 `memory_search` 工具，让 Agent 能自主发起检索。
- **价值**：解决了 LLM 上下文窗口限制问题，并实现了长期核心记忆与短期流水的结构化分离，为未来的差异化权重检索奠定基础。

### 5. 对话上下文与防注入 (Phase 2.2)

- **目标**：在保持对话连续性的同时，严格防御 Prompt Injection 攻击，确保 Agent 人格不被覆盖。
- **实现内容**：
    - **ConversationStore**：内存中的会话管理器，处理会话 TTL（自动过期）与最大历史长度限制。
    - **分层 Prompt 架构**：严格隔离数据层级：
        1. **System Layer**：系统指令与人格设定（最高优先级，用户不可见）。
        2. **History Layer**：过往对话历史。
        3. **User Layer**：当前用户输入（被视为普通内容而非指令）。
- **价值**：增强了系统的健壮性与安全性，避免用户通过恶意指令（如“忽略前面所有指令”）篡改 Agent 的核心行为准则。

### 6. SOUL 人格系统 (Phase 5)

- **目标**：赋予 Agent 独特、连续且可配置的个性，使其不仅仅是一个问答机器。
- **实现内容**：
    - **Workspace 引导体系**：系统启动时自动加载 `~/.belldandy/` 下的定义文件
    - **动态注入**：Gateway 在每一轮对话中都会将这些设定动态组合进 System Prompt
- **价值**：提供了高度的可玩性与定制化空间，用户可以像写小说一样塑造自己专属 AI 的性格。

#### Workspace 文件读取时机机制

| 文件 | 创建时机 | 读取时机 | 注入到 System Prompt | 说明 |
|------|---------|----------|---------------------|------|
| **AGENTS.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是（第一个） | 工作空间使用指南 |
| **SOUL.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | 核心人格定义 |
| **TOOLS.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | 本地工具/环境说明 |
| **IDENTITY.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | Agent 身份信息 |
| **USER.md** | 启动时缺失则创建 | ✅ 每次会话 | ✅ 是 | 用户档案 |
| **HEARTBEAT.md** | 启动时缺失则创建 | ✅ 定时读取 | ❌ 否 | 定时任务配置 |
| **BOOTSTRAP.md** | **仅全新工作区** | ⚠️ 仅存在时 | ✅ 是 | 首次引导仪式 |

#### 文件创建规则

- **全新工作区**（所有核心文件都不存在）：创建全部 7 个文件，包括 BOOTSTRAP.md
- **已有工作区**：只创建缺失的核心文件，**不**创建 BOOTSTRAP.md

#### BOOTSTRAP.md 生命周期

1. 全新工作区启动时自动创建
2. Agent 读取后开始"苏醒对话"
3. 引导完成后 Agent 更新 IDENTITY.md、USER.md
4. Agent 删除 BOOTSTRAP.md，结束引导阶段

---

- **价值**：提供了一个高度可玩性与定制化空间，用户可以像写小说一样塑造自己专属 AI 的性格。

### 7. 插件系统 (Plugin System) Phase 8

- **目标**：建立标准化的扩展机制，允许通过外部 JS/MJS 文件动态扩展 Agent 能力。
- **实现内容**：
    - **PluginRegistry**：插件加载的核心注册表，支持运行时动态加载。
    - **AgentHooks**：实现了生命周期钩子（`beforeRun`, `beforeToolCall`, `afterToolCall`, `afterRun`），允许插件干预 Agent 决策流程。
    - **Tool Extension**：插件可以注册新的 Tool 到 Agent 的工具箱中。
- **价值**：为未来的生态扩展打下基础（如接入 1Password, Linear 等第三方服务）。

### 7.1 钩子系统扩展 (Hook System Extension) Phase 8.3

- **目标**：对标 moltbot 实现完整的 13 种生命周期钩子，支持优先级、双执行模式、错误处理。
- **实现内容**：
    - **HookRegistry**：钩子注册表，支持按来源注册/注销、优先级排序（priority 越高越先执行）。
    - **HookRunner**：钩子执行器，支持三种执行模式：
        - **并行执行 (runVoidHook)**：适用于日志、审计等无返回值场景
        - **顺序执行 (runModifyingHook)**：适用于需要修改参数或取消操作的场景
        - **同步执行 (runToolResultPersist)**：用于热路径中的工具结果持久化
    - **13 种钩子**：
        | 类别 | 钩子名称 | 执行模式 | 用途 |
        |------|---------|---------|------|
        | Agent | `before_agent_start` | 顺序 | 注入系统提示词/上下文 |
        | Agent | `agent_end` | 并行 | 分析完成的对话 |
        | Agent | `before_compaction` | 并行 | 上下文压缩前处理 |
        | Agent | `after_compaction` | 并行 | 上下文压缩后处理 |
        | 消息 | `message_received` | 并行 | 消息接收日志 |
        | 消息 | `message_sending` | 顺序 | 修改或取消即将发送的消息 |
        | 消息 | `message_sent` | 并行 | 消息发送日志 |
        | 工具 | `before_tool_call` | 顺序 | 修改参数或阻止调用 |
        | 工具 | `after_tool_call` | 并行 | 结果审计 |
        | 工具 | `tool_result_persist` | 同步 | 修改持久化的工具结果 |
        | 会话 | `session_start` | 并行 | 初始化会话级资源 |
        | 会话 | `session_end` | 并行 | 清理会话级资源 |
        | 网关 | `gateway_start` | 并行 | 服务初始化 |
        | 网关 | `gateway_stop` | 并行 | 服务清理 |
    - **向后兼容**：保留原有的 `AgentHooks` 简化接口，内部转换为新的注册机制。
- **关键文件**：
    ```
    packages/belldandy-agent/src/
    ├── hooks.ts          # 完整类型定义 + HookRegistry
    ├── hook-runner.ts    # 钩子执行器（新增）
    ├── tool-agent.ts     # 集成新版 hookRunner
    └── index.ts          # 导出新增类型
    ```
- **价值**：与 moltbot 完全对标，为插件系统提供完整的生命周期干预能力。

### 8. 浏览器扩展 (Phase 9)

- **目标**：突破传统 API 的限制，让 Agent 直接接管用户的浏览器，复用登录态与浏览历史。
- **实现内容**：
    - **Relay Server**：一个 WebSocket 中继服务，模拟 CDP (Chrome DevTools Protocol)，让 Puppeteer 可以连接到真实的浏览器扩展。
    - **Chrome Extension**：基于 Manifest V3 (MV3) 开发，利用 `chrome.debugger` API 接管 Tab。
    - **Agent Integration**：封装了标准的 Browser Tools (`browser_open`, `browser_screenshot`, `browser_get_content`, `browser_snapshot`)。
- **技术突破**：
    - 解决了 Puppeteer 与 Extension 之间的 Target ID 映射差异。
    - 实现了自动化中继启动（随 Gateway 拉起）。
    - 攻克了 Extension 环境下的目标发现竞态条件（Race Condition）。
    - **交互式 DOM 快照 (Interactive DOM Snapshot)**：
        - 智能过滤无关噪音（script/style/div），只保留内容与交互元素。
        - 自动分配数字 ID (`[42]`)，Agent 可直接通过 ID 点击元素，无需生成复杂 CSS Selector。
        - Token 消耗降低 50%-80%。
- **价值**：赋予 Agent "看"网页（截图/快照）和"动"网页（点击/输入）的能力，是实现复杂 Web 任务自动化的基石。

### 8. 系统级操作 (System Execution) Phase 10
- **目标**：赋予 Agent 在宿主机执行 Shell 命令的能力，但必须保证宿主机安全。
- **策略**：**Consumer Safe Mode (消费者安全模式)**
    - **严格白名单**：只允许 `git`, `npm`, `ls`, `cd`, `pwd`, `date` 等开发与诊断工具。
    - **风险阻断**：
        - 🚫 **Blocklist**：`sudo`, `su`, `mkfs`, `dd` 等特权/破坏指令直接拦截。
        - ⚠️ **Arg Check**：允许 `rm` 但 **严禁** `rm -r` / `rm -rf`，强迫 Agent 使用更安全的 `delete_file` 工具或非递归删除。
- **价值**：填补了 Agent 无法执行 `npm install` 或 `git commit` 的能力空白，使其成为真正的"全栈工程师"。

### 9. 实时文件感知 (Real-time File Perception) Phase 11

- **目标**：让 Agent 能够即时感知用户对文件的修改，无需重启或手动刷新。
- **实现内容**：
    - **Watcher**：集成 `chokidar` 监听工作空间文件变化（add/change/unlink）。
    - **Incremental Indexing**：文件修改后 1秒内自动触发增量索引，更新 Memory 数据库。
    - **Auto Cleanup**：文件删除时自动清理对应的 chunks 和 vectors。
- **价值**：消除了 AI 记忆滞后的问题，特别是对于 Coding 场景，Agent 永远知道最新的代码状态。

### 10. 性能与向量加速 (Vector Optimization) Phase 12

- **目标**：引入 `sqlite-vec` 替换纯 JS 的向量计算，实现生产级性能。
- **实现内容**：
    - **核心引擎**：引入 `sqlite-vec` (C++ Extension) 提供底层的 SIMD 加速支持。
    - **存储升级**：使用 `vec0` 虚拟表存储高维向量（替代 BLOB），支持高效的 L2/Cosine 距离计算。
    - **架构优化**：
        - 移除应用层所有计算开销，直接下沉到 SQLite SQL 查询（`WHERE embedding MATCH ?`）。
        - 实现了 `rowid` 映射机制，确保 Metadata 表与 Vector 表的强一致性。
- **性能飞跃**：
    - 检索延迟：**~12ms** (10k 向量)，相比 JS 实现提升显著。
    - 内存占用：大幅降低，不再需要将所有向量加载到 Node.js 堆内存中。
- **价值**：支撑海量记忆（百万级 Chunk）的基础设施升级，让 Belldandy 有能力管理整个代码库的知识。

### 11. 多媒体与语音 (Multimedia & TTS) Phase 13

- **目标**：实现高质量、低成本的语音交互能力。
- **技术方案**：
    - **Multi-Provider 架构**：重构 `text_to_speech` 工具，抽象出 Provider 接口，同时支持 `openai` (REST API) 和 `edge` (WebSocket 逆向)。
    - **Node-Edge-TTS**：选用 `node-edge-tts` 库，无需安装浏览器即可通过 WebSocket 协议调用 Azure 顶级神经元语音（晓晓/云希）。
    - **静态资源服务**：Gateway 新增 `/generated` 静态路由，将本地生成的 MP3 文件暴露为 HTTP 链接，供前端 `<audio>` 标签播放。
    - **动态 System Prompt**：实现文件信号机制 (`TTS_ENABLED`)。Gateway 每次请求前检查该文件，若存在则动态注入 "MUST use text_to_speech tool" 的 System Prompt 指令，实现无需重启的热开关。
- **价值**：极大提升了交互的拟人感，且利用 Edge TTS 实现了零成本的高质量语音体验。

### 12. 视觉感知 (Vision) Phase 13.5

- **目标**：赋予 Agent 视觉能力，使其能够"看到"物理世界。
- **实现内容**：
    - **回环视觉 (Loopback Vision)**：利用现有的 Browser Extension + WebDriver 协议。
    - **Mirror Page**：Gateway 托管 `/mirror.html`，调用 `navigator.mediaDevices.getUserMedia` 显示摄像头画面。
    - **Agent Action**：Agent 使用 `browser_navigate` 打开页面，然后使用 `browser_screenshot` 获取视觉帧。
- **价值**：无需引入复杂的 WebRTC 或流媒体协议，复用现有浏览器能力实现"看世界"。

### 13. 方法论系统 (Methodology) Phase 14

- **目标**：让 Agent 具备"自我进化"与"经验沉淀"能力。
- **实现内容**：
    - **Methodology Skills**：
        - `method_list` / `method_search`：查找现有 SOP。
        - `method_read`：读取 SOP 步骤。
        - `method_create`：沉淀新的经验方法。
    - **Prompt Injection**：System Prompt 中注入 "Methodology Protocol"，强制 Agent 在复杂任务前查阅、任务后反思。
    - **Runtime Support**：自动管理 `~/.belldandy/methods` 目录。
- **价值**：解决 Agent "用完即忘"的问题，将隐性知识显性化为可复用的 Markdown 文档。

---

### 6. Phase 2.5: 可视化配置 & System Doctor (用户体验升级)

**状态**：✅ 已完成

为了解决“手动改配置文件太极客”的痛点，我们在 WebChat 中集成了**可视化配置面板**。

#### ✨ 功能亮点
1.  **Lenient Mode (宽容模式)**：
    *   Gateway 启动时不再强校验 API Key。
    *   即使用户什么都没配，也能打开界面（不会白屏/Crash）。
    *   只有在真正发消息时，才会提示“配置缺失”并弹出设置窗。
2.  **Settings UI (配置面板)**：
    *   点击右上角“⚙️”图标即可打开。
    *   支持修改 **OpenAI Key**, **Base URL**, **Model**, **Heartbeat Interval**。
    *   **Auto-Save & Restart**: 点击 Save 后，自动更新 `.env.local` 并重启后端进程（配合 `start.sh/bat` 守护进程实现）。
3.  **System Doctor (系统体检)**：
    *   面板顶部实时显示 Health Badge。
    *   检查项：Node.js 版本、Vector DB 状态、Agent Config 有效性。

#### 🛠️ 技术实现
*   **Backend**: 
    *   新增 `config.read` / `config.update` 协议（读写 `.env.local`）。
    *   新增 `system.doctor` 协议（自检）。
    *   新增 `system.restart` 协议（`process.exit(100)` 触发守护进程重启）。
*   **Frontend**: 
    *   原生 JS/CSS 实现 Modal 组件，无缝集成到现有 MVP。

### 7. Phase 3: 极致美学重构 (Ethereal Digital UI)

**状态**：✅ 已完成

**目标**：将功能性的 MVP 界面升级为具有高级感、沉浸感的用户体验。

**实现内容**：
- **Ethereal Design System**:
    - **视觉**: 采用 "Deep Void" 深空黑背景配合 "Divine Cyan" 青色霓虹点缀，营造赛博神性氛围。
    - **质感**: 广泛使用 CSS `backdrop-filter: blur` 实现高级磨砂玻璃效果 (Glassmorphism)。
    - **排版**: 引入 `Outfit` (Headings) 和 `Inter` (Body) 谷歌字体。
- **Awakening Ritual (唤醒仪式)**:
    - 实现了首次连接时的 **Boot Sequence** 动画。
    - 模拟终端自检日志滚动 (`Initializing Neural Interface...`)，赋予 AI "生命感"。
- **交互微调**:
    - **Smart Input**: 实现了 `textarea` 的高度自适应与 Shift+Enter 换行逻辑。
    - **Motion**: 添加了消息气泡的淡入上浮动画 (`fade-up`)。

---

## 🚧 待实现功能规划 (后续)

### 8. Phase 3.1: Pairing 管理完善 (Security)

- **目标**：将 Belldandy 接入飞书自建应用，利用其 WebSocket 模式实现无需内网穿透的实时对话。
- **状态**：**已完成**（2026-02-01）
- **实现内容**：`@belldandy/channels` 包 + FeishuChannel（WebSocket 长连接），消息去重，Kimi K2.5 工具调用兼容。

### 14. 渠道架构升级 (Channel Architecture) Phase 15

- **目标**：建立标准化的渠道接口，方便后续快速接入 Telegram、Discord、Slack 等社交平台。
- **状态**：**已完成**（2026-02-05）
- **实现内容**：
    - **Channel 通用接口**：定义了所有渠道必须实现的标准方法（`start`、`stop`、`sendProactiveMessage`）。
    - **ChannelManager**：渠道管理器，支持统一注册、启停、广播消息。
    - **FeishuChannel 适配**：飞书渠道已实现新接口，完全向后兼容。
- **接口设计**：
    ```typescript
    interface Channel {
        readonly name: string;           // 渠道名称: "feishu", "telegram"
        readonly isRunning: boolean;     // 运行状态
        start(): Promise<void>;          // 启动渠道
        stop(): Promise<void>;           // 停止渠道
        sendProactiveMessage(content: string, chatId?: string): Promise<boolean>;
    }
    ```
- **文件结构**：
    ```
    packages/belldandy-channels/src/
    ├── types.ts      # Channel 通用接口定义
    ├── manager.ts    # ChannelManager 管理器
    ├── feishu.ts     # 飞书渠道实现 (implements Channel)
    └── index.ts      # 统一导出
    ```
- **价值**：降低新渠道接入成本，只需实现 `Channel` 接口即可接入系统，预计每个新渠道开发周期可缩短至 1-2 天。

### 2. Phase 7: Heartbeat 定时任务 ✅ 已完成

- **目标**：让 Agent 能够定期"醒来"检查 HEARTBEAT.md 并主动联系用户。
- **状态**：**已完成**（2026-02-01）
- **实现内容**：
    - 心跳 Runner（`packages/belldandy-core/src/heartbeat/`）
    - 定时触发 + 活跃时段支持（深夜不打扰）
    - HEARTBEAT.md 内容解析（空文件跳过）
    - HEARTBEAT.md 内容解析（空文件跳过）
    - HEARTBEAT_OK 响应检测（无事静默，有事推送）
- **价值**：Agent 可以主动提醒用户，如每日日程检查、待办事项提醒等。

#### 💡 Moltbot 对标分析：Heartbeat 模块

| 功能特性 | Moltbot 实现 | Belldandy 实现 | 差异/优化点 |
|---------|-------------|----------------|------------|
| **基础触发** | 定时器 + Command Queue 检查 | 简单定时器 (setInterval) | Belldandy 尚未实现队列忙碌检测，可能在 Agent 繁忙时插队 |
| **活跃时段** | 支持 User/Local 时区，精确分钟控制 | 支持时区与 HH:MM 范围 | 基本一致，Moltbot 的时区处理更健壮 |
| **消息去重** | ✅ **支持** (24内重复内容静默) | ❌ **未实现** | **差异点**：Moltbot 防止了一件事重复唠叨，Belldandy 可能会重复提醒 |
| **空值优化** | ✅ 检查文件内容是否为空 (skip empty) | ✅ 检查文件内容是否为空 | 一致，节省 Token |
| **静默响应** | `HEARTBEAT_OK` token 检测 | `HEARTBEAT_OK` token 检测 | 一致 |
| **多 Agent** | 支持每个 Agent 独立频率与配置 | 全局单一配置 | 架构差异，当前够用 |

> **改进建议**：未来应引入消息去重机制（Deduplication），防止 Agent 在无法执行操作时反复发送同一条提醒。

### 3. MCP (Model Context Protocol) 支持 (Phase 17) ✅ 已完成

- **目标**：实现 MCP 协议支持，让 Belldandy 能够连接外部 MCP 服务器，获取第三方工具和数据源。
- **背景**：MCP 是 Anthropic 提出的标准化协议，moltbot 通过 ACP 实现了类似功能。
- **状态**：**已完成**（2026-02-05）
- **实现内容**：
    - **新建 `@belldandy/mcp` 包**：完整的 MCP 客户端实现
    - **类型定义 (types.ts)**：配置类型、运行时状态、事件类型等
    - **配置加载 (config.ts)**：使用 Zod 验证 `~/.belldandy/mcp.json` 配置
    - **MCP 客户端 (client.ts)**：支持 stdio/SSE 两种传输方式
    - **工具桥接 (tool-bridge.ts)**：MCP 工具 → Belldandy Skills 转换
    - **管理器 (manager.ts)**：多服务器连接管理、工具发现、事件处理
    - **Gateway 集成**：启动时自动初始化 MCP 并注册工具
- **配置示例** (`~/.belldandy/mcp.json`)：
    ```json
    {
      "version": "1.0.0",
      "servers": [
        {
          "id": "filesystem",
          "name": "文件系统",
          "transport": {
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
          },
          "autoConnect": true,
          "enabled": true
        }
      ],
      "settings": {
        "defaultTimeout": 30000,
        "toolPrefix": true
      }
    }
    ```
- **新增环境变量**：
    | 变量 | 说明 |
    |------|------|
    | `BELLDANDY_MCP_ENABLED` | 启用 MCP 支持（默认 false） |
- **价值**：**开放生态**。用户可以接入任何 MCP 兼容的服务（1Password、GitHub、Notion、Slack 等），无需修改 Belldandy 代码即可扩展能力。

### 4. 日志系统 (Logging System) Phase 18 [核心已完成]

- **目标**：实现完整的文件日志系统，支持 Agent 回溯分析任务执行过程、错误排查和性能分析。
- **状态**：✅ 已完成
- **核心价值**：
    - **可观测性**：系统运行状态完全可追溯
    - **自我进化**：Agent 能基于历史日志学习和改进，与方法论系统协同
    - **运维友好**：自动轮转和清理，无需人工干预
- **实现内容**：
    - **Logger 核心**：统一的日志接口，支持 debug/info/warn/error 四个级别
    - **双输出**：同时输出到控制台（彩色）和文件（持久化）
    - **文件轮转**：
        - 按日期分文件：`logs/2026-02-05.log`
        - 按大小轮转：单文件超过 10MB 自动创建 `.1.log`、`.2.log`
    - **自动清理**：启动时清理超过保留天数（默认 7 天）的日志
    - **Agent 工具**：`log_read`、`log_search` 让 Agent 能读取日志进行自我分析
- **日志格式**：
    ```
    [2026-02-05T14:32:15.123+08:00] [INFO] [gateway] Server started on port 28889
    [2026-02-05T14:32:15.456+08:00] [DEBUG] [agent] Tool call: file_read {path: "..."}
    [2026-02-05T14:32:15.789+08:00] [WARN] [memory] Slow query detected: 1523ms
    [2026-02-05T14:32:16.012+08:00] [ERROR] [tools] web_fetch failed: ECONNREFUSED
    ```
- **日志目录**：
    ```
    ~/.belldandy/
    ├── logs/                       # 日志目录
    │   ├── 2026-02-05.log          # 当天日志
    │   ├── 2026-02-05.1.log        # 当天轮转文件
    │   ├── 2026-02-04.log          # 昨天日志
    │   └── ...
    ```
- **环境变量**：
    | 变量 | 说明 | 默认值 |
    |------|------|--------|
    | `BELLDANDY_LOG_LEVEL` | 最低日志级别 | `debug` |
    | `BELLDANDY_LOG_DIR` | 日志目录 | `~/.belldandy/logs` |
    | `BELLDANDY_LOG_MAX_SIZE` | 单文件最大大小 | `10MB` |
    | `BELLDANDY_LOG_RETENTION_DAYS` | 日志保留天数 | `7` |
- **与方法论系统的协同**：
    1. Agent 执行任务时，详细日志记录每一步操作与耗时
    2. 任务失败时，Agent 可通过 `log_search` 定位错误
    3. Agent 分析日志后，可调用 `method_create` 沉淀经验
    4. 下次遇到类似任务，Agent 先查阅方法论，避免重复踩坑
- **已完成扩展**：
    - MCP 全模块接入 logger（manager/client/config/tool-bridge）
    - tool-agent 钩子失败日志接入 logger
    - ToolExecutor auditLogger 接入，工具调用耗时写入日志
    - camera_snap 使用 context.logger

### 5. Local Embedding (优先级：低)

- **目标**：摆脱对 OpenAI Embedding API 的依赖，实现完全本地化的记忆检索。
- **实现内容**：
    - 引入 `node-llama-cpp` 或 `transformers.js` 等本地推理库。
    - 支持加载本地 Embedding 模型（如 `all-MiniLM-L6-v2` 或 `bge-m3`）。
    - 实现一个新的 `EmbeddingProvider` 接口实现类。
- **价值**： **隐私与成本**。不需要把记忆片段发给 OpenAI 计算向量，完全离线可用，且无 API 费用。但会增加内存占用和安装包体积。
- **工作量**：**中等**。主要挑战在于 Native 依赖的安装和模型文件的管理。

### 4. SOUL_EVIL 彩蛋 (优先级：低)

- **目标**：增加趣味性和“灵魂”感。
- **实现内容**：
    - 在特定触发条件下（如特定日期、特定指令、或随机概率），加载 `SOUL_EVIL.md` 替代默认的 `SOUL.md`。
    - Agent 的性格、语气会发生反转（模仿 moltbot 的彩蛋设计）。
- **价值**：**娱乐性**。让 AI 显得不那么死板。
- **工作量**：**低**。主要是逻辑判断和 System Prompt 的动态切换。

### 5. Memory Flush 机制 (优先级：低)

- **目标**：性能优化。
- **实现内容**：
    - 在记忆写入及索引过程中引入 Buffer 缓冲。
    - 在系统空闲或关闭前统一将内存中的变更写入磁盘（Compaction）。
- **价值**：**性能与硬盘寿命**。防止高频对话时频繁对 SQLite 进行微小写入。在目前单人使用且数据量不大的情况下，收益不明显。
- **工作量**：**低**。

---

## 🔐 安全与网络加固路线图

> 本节基于当前代码实现的安全评估结果，按优先级梳理出后续需要落实的安全加固工作，便于在 Roadmap 中单独排期（可作为后续 Phase 19+ 的输入）。

### 1. P0：配对绕过风险（workspace.read 暴露 allowlist/mcp 配置）

- **现状与风险**：
  - Gateway 提供的 `workspace.read` / `workspace.list` RPC 当前不在 `secureMethods` 中，未配对客户端也可以调用。
  - 由于 `~/.belldandy/allowlist.json`（授权客户端列表）和 `~/.belldandy/mcp.json`（MCP 配置）都位于 `stateDir` 且扩展名为 `.json`，在默认配置下，可以通过 `workspace.read` 被读取，然后伪造 `clientId` 绕过 Pairing 机制。
- **最小改动方向（代码位置）**：
  - 在 `packages/belldandy-core/src/server.ts` 中：
    - 将 `"workspace.read"`、`"workspace.list"` 纳入 `secureMethods` 列表，使其与 `message.send/config.read/config.update/system.restart/workspace.write` 一样受 `isClientAllowed` 保护。
    - 或者在 `handleReq` 的 `case "workspace.read"` 分支中，对 `allowlist.json`、`pairing.json`、`mcp.json` 等文件名做显式拒绝，禁止通过 RPC 读取这些内部状态文件。
  - 进一步规划一个内部状态目录（如 `stateDir/internal/`），仅供服务端访问，不通过任何 RPC 暴露。

### 2. P1：本地 WebSocket 被浏览器脚本劫持（CSWSH）+ 默认 AUTH_MODE=none

- **现状与风险**：
  - 默认配置为 `HOST=127.0.0.1`、`AUTH_MODE=none`，本机浏览器中任意网页脚本都可以尝试连接 `ws://127.0.0.1:28889`。
  - 结合上面的 P0 问题，恶意网页可以在用户不知情的情况下连上 Gateway → 读取 `allowlist.json` → 伪造已配对 `clientId` → 获取完整控制权（读写 workspace、修改配置、控制浏览器等）。
- **最小改动方向（代码位置）**：
  - 在 `packages/belldandy-core/src/bin/gateway.ts` 中：
    - 将默认 `BELLDANDY_AUTH_MODE` 从 `none` 调整为 `token`，并在 `.env.example` 与文档中同步说明。
    - 启动时若检测到 `HOST=0.0.0.0` 且 `AUTH_MODE=none`，直接拒绝启动（抛错并退出），而不是仅打印 Warning。
  - 在 `server.ts:acceptConnect` 中考虑引入仅服务器掌握的 `sessionToken`/`serverNonce`，要求客户端在 `connect` 帧中返回，以降低被任意本地脚本伪造连接的风险（结合启动脚本中已有的 Magic Token 机制）。

### 3. P1：config.read/update 暴露与篡改 `.env.local`

- **现状与风险**：
  - `config.read` 当前会直接读取项目根目录下的 `.env.local` 并将所有键值原样返回，`config.update` 可写入任意 key。
  - 在 P0 绕过存在时，这意味着 `.env.local` 中存放的 OpenAI Key、MCP Token 等 secrets 可能被远程读取或恶意修改。
- **最小改动方向（代码位置）**：
  - 在 `packages/belldandy-core/src/server.ts` 的 `case "config.read"` 分支中：
    - 对包含 `password/token/api_key/secret` 等敏感字段名的值进行脱敏处理（例如统一返回 `[REDACTED]`），对齐 `packages/belldandy-skills/src/executor.ts` 中 `audit` 的脱敏逻辑。
  - 在 `case "config.update"` 中：
    - 增加允许修改键的白名单，仅允许更改模型配置、心跳参数、浏览器中继等运行相关配置，禁止远程修改日志目录、stateDir 等安全敏感项。

### 4. P2：MCP 与高权限工具的边界收紧（显式 Opt-in）

- **现状与风险**：
  - MCP 服务器一旦启用，其提供的所有工具会被桥接为本地工具（`mcp_{serverId}_{toolName}`），能力完全由远端实现决定（可能包含远程文件/命令/网络等高权限操作）。
  - 高权限工具 `run_command`、`terminal`、`code_interpreter` 在 `@belldandy/skills` 中对开发者开放，若被误注册进 Gateway，对外即形成标准 RCE 接口。
- **最小改动方向（代码位置）**：
  - 在 `packages/belldandy-core/src/bin/gateway.ts` 中：
    - 强化对 `BELLDANDY_MCP_ENABLED` 的判断：仅在 `TOOLS_ENABLED=true` 且显式开启 MCP 时才注册 MCP 工具，并在日志中打印当前启用的 MCP 服务器与工具数量，便于审计。
  - 在 `packages/belldandy-skills/src/index.ts` 与开发文档中：
    - 对 `run_command` / `terminal` / `code_interpreter` 明确标注为“高风险，仅供本地开发调试使用”，要求上层集成者在注册到对外 Agent 前进行显式 Opt-in。

### 5. P2：web_fetch SSRF 防护细节增强

- **现状与风险**：
  - 目前的 SSRF 防护基于 `URL.hostname` 的字符串匹配，能够拦截明显的内网域名/IP，但对整数 IP（如 `http://2130706433/`）或某些 DNS 解析到内网的场景缺乏覆盖。
- **最小改动方向（代码位置）**：
  - 在 `packages/belldandy-skills/src/builtin/fetch.ts` 中：
    - 在发送请求前，对 `url.hostname` 做进一步解析：
      - 若为纯数字或非常规 IP 格式，尝试解析为 IP 后再次调用 `isPrivateHost`；
      - 可选增加 `dns.lookup` 的解析步骤，将解析结果 IP 再过一遍内网网段检查（可通过策略开关控制，避免影响性能）。

### 6. P3：浏览器自动化的域名/页面访问控制

- **现状与风险**：
  - 启用 Browser Relay (`BELLDANDY_BROWSER_RELAY_ENABLED=true`) 后，Agent 可以在用户浏览器中打开任意 URL、读取内容、截图并执行操作，目前缺少对访问域名或路径的显式限制。
- **最小改动方向（代码位置）**：
  - 在 `packages/belldandy-skills/src/builtin/browser/tools.ts` 中：
    - 为 `browser_open` / `browser_navigate` 增加可选的域名白名单/黑名单策略，参数结构可以复用 `web_fetch` 的 `allowedDomains` / `deniedDomains` 思路。
  - 在 Gateway 与配置层面：
    - 通过环境变量（如 `BELLDANDY_BROWSER_ALLOWED_DOMAINS`）注入默认可访问域名，并在 README/使用手册中强调“启用浏览器控制等同于赋予 Agent 对浏览器的高权限操作能力”。

---

## 📚 附录：Moltbot 能力清单 (参考基准)

以下是参考项目 **moltbot** 目前已实现的完整能力清单，Belldandy 的开发正是为了逐步对齐这些能力。

### 1. 核心文件操作 (Core Coding)
Agent 可以像工程师一样直接操作项目代码。
- **`read_file_content`** / **`readTool`**：读取文件内容。
- **`list_files`**：列出目录结构。
- **`write_file`**：写入新文件或覆盖文件。
- **`edit_file`**：编辑现有文件（支持多处查找替换）。
- **`apply_patch`**：应用 Unified Diff 补丁。

### 2. 浏览器自动化 (Browser Control)
Agent 拥有一个极其强大的 **`browser`** 工具，可以控制无头浏览器与网页交互。
- **`status`**：检查浏览器状态。
- **`start`** / **`stop`**：启动/关闭浏览器实例。
- **`profiles`**：切换环境（`chrome`=接管用户浏览器扩展, `clawd`=隔离沙箱环境）。
- **`tabs`** / **`open`** / **`focus`** / **`close`**：完整的标签页管理。
- **`snapshot`**：获取 AI 优化过的页面结构快照（Accessibility Tree），这是 Agent "看懂"网页的关键。
- **`screenshot`** / **`pdf`**：截屏或保存 PDF。
- **`act`**：执行 UI 操作（点击、输入、按键、等待、滚动）。
- **`console`**：读取浏览器控制台日志。
- **`upload`** / **`dialog`**：处理文件上传弹窗和 JS Alert 弹窗。

### 3. 系统与执行 (System)
- **`exec`**：执行 Shell 命令（受控环境）。
- **`process`**：管理长运行进程（如启动开发服务器）。

### 4. 网络与数据 (Web & Data)
- **`web_search`**：进行 Google/Bing 搜索。
- **`web_fetch`**：轻量级抓取网页内容（不启动完整浏览器）。

### 5. 多媒体生成 (Media)
- **`tts`**：文本转语音（Text-to-Speech）。
- **`image`**：图像生成或视觉识别。
- **`canvas`**：绘图能力。

### 6. 会话与编排 (Orchestration)
- **`agents_list`** / **`sessions_spawn`**：管理多 Agent 协作与子任务分发。
- **`cron`**：设置定时任务。
- **`message`**：跨渠道发送消息。
- **`nodes`**：知识图谱/记忆节点管理。

### 7. 外部扩展 (Plugins)
Moltbot 支持大量第三方集成插件（Skills），例如：
- 1Password, Spotify, Linear, GitHub, Notion, Slack 等。

### 8. 安全与存储 (Security & Persistence)
- **文件权限 (System Access)**：
    - 支持 **Sandboxed** (Docker/受限目录) 和 **Host** (本机系统级) 两种运行模式。
    - 危险操作（如 `exec` 和 `browser`）可以通过 Policy 策略配置为仅限沙箱运行，或允许受控的本机访问。
- **持久化 (Persistence)**：
    - **Session**：对话历史存储为 JSON 文件（带文件锁）。
    - **Memory**：使用 `node:sqlite` + `sqlite-vec` 实现本地向量数据库。
    - **Media**：图片/文件自动存储在本地文件系统中。

> **Belldandy 现状对比**：目前 Belldandy 已实现了 **文件操作** (read/write)、**Web Fetch**、**Memory** 以及 **浏览器自动化（基础版）** 能力。**系统命令执行** 属于高风险模块，目前尚未引入。

---

## 📊 Moltbot vs Belldandy Agent 能力详细对比

### 对比总结

| 能力类别 | Moltbot | Belldandy | 差距 |
|---------|---------|-----------|------|
| **文件操作** | ✅ 完整 | ✅ 完整 | `list_files`, `apply_patch` (DSL) 已就绪 |
| **系统命令** | ✅ exec/process | ✅ exec/terminal | **Safe Mode** 保护 |
| **浏览器自动化** | ✅ 28+ actions | ✅ 核心闭环 | 支持快照/截图/操作/中继 |
| **网络请求** | ✅ search + fetch | ✅ search + fetch | 集成 Brave/SerpAPI |
| **记忆系统** | ✅ memory + nodes | ✅ memory | 缺少 `nodes` 图谱 |
| **多媒体** | ✅ tts/image/canvas | ✅ tts/image | 缺少 `canvas` |
| **会话编排** | ✅ 完整 | ❌ 未实现 | — |
| **渠道集成** | ✅ 4+ channels | ✅ 飞书 + Channel 接口 | 架构已就绪，可快速扩展 |
| **定时任务** | ✅ cron tool | ✅ heartbeat | 不同实现 |
| **插件系统** | ✅ 丰富 | ✅ 完整对标 | 13 种钩子 + HookRunner + 优先级 |
| **MCP 支持** | ✅ ACP 协议 | ✅ MCP 协议 | stdio/SSE 传输 + 工具桥接 |

---

### Moltbot Agent 工具完整清单

#### 1. 文件操作 (Coding Tools)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `read` / `read_file_content` | 读取文件内容 | ✅ `file_read` |
| `write` / `write_file` | 写入文件 | ✅ `file_write` |
| `edit` | 编辑现有文件（多处替换） | ✅ `edit_file` |
| `list_files` | 列出目录结构 | ✅ `list_files` |
| `apply_patch` | 应用 Unified Diff 补丁 | ✅ `apply_patch_dsl` |

#### 2. 系统命令 (Execution)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `exec` | 执行 Shell 命令（受控环境） | ✅ `run_command` (Safe) |
| `process` | 管理长运行进程（后台任务） | ✅ `process_manager` |

> ⚠️ **安全提示**：这两个工具允许 Agent 执行任意系统命令。Moltbot 通过 Docker 沙箱、执行审批机制、白名单等手段控制风险。

#### 3. 浏览器自动化 (Browser Control)

| Action | 说明 | Belldandy |
|--------|------|-----------|
| `status` | 检查浏览器状态 | ✅ `browser_status` |
| `start` / `stop` | 启动/关闭浏览器 | ✅ (自动/中继) |
| `tabs` / `open` / `focus` / `close` | 标签页管理 | ✅ `browser_manage_tab` |
| `snapshot` | AI 优化页面结构快照 | ✅ `browser_snapshot` |
| `screenshot` / `pdf` | 截屏/保存 PDF | ✅ `browser_screenshot` |
| `act` | 点击/输入/按键/滚动 | ✅ `browser_action` |

#### 4. 网络与数据 (Web)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `web_search` | Google/Bing 搜索 | ✅ `web_search` |
| `web_fetch` | 轻量级网页抓取 | ✅ |

#### 5. 多媒体 (Media)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `tts` | 文本转语音 | ✅ `text_to_speech` |
| `image` | 图像生成/视觉识别 | ✅ `image_generate` |
| `canvas` | 绘图能力 | ❌ |

#### 6. 会话与编排 (Orchestration)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `agents_list` | 列出可用 Agent | ❌ |
| `sessions_list` | 列出会话 | ❌ |
| `sessions_spawn` | 创建子 Agent 任务 | ❌ |
| `cron` | 定时任务管理 | ⚠️ heartbeat |
| `message` | 跨渠道发送消息 | ❌ |

#### 7. 记忆与知识 (Memory & Nodes)

| 工具 | 说明 | Belldandy |
|------|------|-----------|
| `memory_search` | 向量+关键词检索 | ✅ |
| `memory_read` | 读取记忆文件 | ✅ |
| `memory_write` | 写入记忆 | ✅ |
| `nodes` | 知识图谱节点管理 | ❌ |

#### 8. 渠道特定工具

| 渠道 | Belldandy | 说明 |
|------|-----------|------|
| Slack | ⏳ 待实现 | Channel 接口已就绪 |
| Discord | ⏳ 待实现 | Channel 接口已就绪 |
| Telegram | ⏳ 待实现 | Channel 接口已就绪 |
| WhatsApp | ⏳ 待实现 | Channel 接口已就绪 |
| 飞书 | ✅ 已实现 | 完整实现 Channel 接口 |

---

### Belldandy 当前已实现

| 能力 | 工具/功能 |
|------|----------|
| **文件读取** | `file_read` |
| **文件写入** | `file_write` |
| **网页抓取** | `web_fetch`（含域名黑白名单、SSRF 防护） |
| **记忆检索** | `memory_search`（FTS5 + 向量混合检索） |
| **记忆读写** | `memory_read`, `memory_write` |
| **飞书渠道** | `FeishuChannel`（WebSocket 长连接） |
| **定时触发** | `Heartbeat Runner`（读取 HEARTBEAT.md） |
| **会话历史** | `ConversationStore`（内存 + TTL） |

---

### 🎯 推荐下一步优先级
 
 1. ~~**`list_files`** — 低风险，直接列目录，Agent 探索能力基础~~ ✅ 已完成
 2. ~~**`web_search`** — 中等风险，需对接搜索 API（Bing/Google/DuckDuckGo）~~ ✅ 已完成
 3. ~~**`exec` (沙箱版)** — 高风险，已实现 Consumer Safe Mode~~ ✅ 已完成 (含 Windows 支持)
 4. ~~**`browser` (基础版)** — 高复杂度，可先做 `navigate` + `screenshot`~~ ✅ 已完成
 5. **`logging` (日志系统)** — 文件日志 + 轮转 + Agent 日志工具（Phase 18）
 6. **`sessions_spawn` (子 Agent 编排)** — 赋予 Agent 团队作战能力（Phase 16）
 7. **`canvas` / `code_interpreter` (Stateful)** — 更高级的创造与计算能力

