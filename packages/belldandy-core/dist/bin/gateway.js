import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { OpenAIChatAgent, ToolEnabledAgent, ensureWorkspace, loadWorkspaceFiles, buildSystemPrompt, } from "@belldandy/agent";
import { ToolExecutor, DEFAULT_POLICY, fetchTool, fileReadTool, fileWriteTool, fileDeleteTool, createMemorySearchTool, createMemoryGetTool, browserOpenTool, browserNavigateTool, browserClickTool, browserTypeTool, browserScreenshotTool, browserGetContentTool, cameraSnapTool, imageGenerateTool, textToSpeechTool, methodListTool, methodReadTool, methodCreateTool, methodSearchTool, } from "@belldandy/skills";
import { MemoryStore, MemoryIndexer, listMemoryFiles, ensureMemoryDir } from "@belldandy/memory";
import { RelayServer } from "@belldandy/browser";
import { FeishuChannel } from "@belldandy/channels";
import { startGatewayServer } from "../server.js";
import { startHeartbeatRunner } from "../heartbeat/index.js";
import { initMCPIntegration, registerMCPToolsToExecutor, printMCPStatus, } from "../mcp/index.js";
// --- Env Loading ---
loadEnvFileIfExists(path.join(process.cwd(), ".env.local"));
loadEnvFileIfExists(path.join(process.cwd(), ".env"));
function readEnv(name) {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : undefined;
}
function loadEnvFileIfExists(filePath) {
    let raw;
    try {
        raw = fs.readFileSync(filePath, "utf-8");
    }
    catch (err) {
        const code = err.code;
        if (code === "ENOENT")
            return;
        return;
    }
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
        const eq = normalized.indexOf("=");
        if (eq <= 0)
            continue;
        const key = normalized.slice(0, eq).trim();
        if (!key)
            continue;
        if (process.env[key] && process.env[key].trim())
            continue;
        let value = normalized.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
            (value.startsWith("'") && value.endsWith("'") && value.length >= 2)) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}
// --- Configuration ---
const port = Number(readEnv("BELLDANDY_PORT") ?? "28889");
const host = readEnv("BELLDANDY_HOST") ?? "127.0.0.1"; // Security: Default to localhost
const authMode = (readEnv("BELLDANDY_AUTH_MODE") ?? "none");
const authToken = readEnv("BELLDANDY_AUTH_TOKEN");
const authPassword = readEnv("BELLDANDY_AUTH_PASSWORD");
const webRoot = readEnv("BELLDANDY_WEB_ROOT") ?? path.join(process.cwd(), "apps", "web", "public");
// Channels
const feishuAppId = readEnv("BELLDANDY_FEISHU_APP_ID");
const feishuAppSecret = readEnv("BELLDANDY_FEISHU_APP_SECRET");
// Heartbeat
const heartbeatEnabled = readEnv("BELLDANDY_HEARTBEAT_ENABLED") === "true";
const heartbeatIntervalRaw = readEnv("BELLDANDY_HEARTBEAT_INTERVAL") ?? "30m";
const heartbeatActiveHoursRaw = readEnv("BELLDANDY_HEARTBEAT_ACTIVE_HOURS"); // e.g. "08:00-23:00"
// State & Memory
const defaultStateDir = path.join(os.homedir(), ".belldandy");
const stateDir = readEnv("BELLDANDY_STATE_DIR") ?? defaultStateDir;
const memoryDbPath = readEnv("BELLDANDY_MEMORY_DB") ?? path.join(stateDir, "memory.db");
// Agent & Tools
const agentProvider = (readEnv("BELLDANDY_AGENT_PROVIDER") ?? "mock");
const openaiBaseUrl = readEnv("BELLDANDY_OPENAI_BASE_URL");
const openaiApiKey = readEnv("BELLDANDY_OPENAI_API_KEY");
const openaiModel = readEnv("BELLDANDY_OPENAI_MODEL");
const openaiStream = (readEnv("BELLDANDY_OPENAI_STREAM") ?? "true") !== "false";
const openaiSystemPrompt = readEnv("BELLDANDY_OPENAI_SYSTEM_PROMPT");
const toolsEnabled = (readEnv("BELLDANDY_TOOLS_ENABLED") ?? "false") === "true";
// MCP
const mcpEnabled = (readEnv("BELLDANDY_MCP_ENABLED") ?? "false") === "true";
// --- Activity Tracking ---
let lastActiveTime = 0;
const onActivity = () => {
    lastActiveTime = Date.now();
};
const isBusy = () => {
    // Busy if active in last 2 minutes
    return Date.now() - lastActiveTime < 2 * 60 * 1000;
};
// --- Validation ---
if (!Number.isFinite(port) || port <= 0) {
    throw new Error("Invalid BELLDANDY_PORT");
}
if (authMode === "token" && !authToken) {
    throw new Error("BELLDANDY_AUTH_MODE=token requires BELLDANDY_AUTH_TOKEN");
}
if (authMode === "password" && !authPassword) {
    throw new Error("BELLDANDY_AUTH_MODE=password requires BELLDANDY_AUTH_PASSWORD");
}
// [MODIFIED] Lenient Mode: Removed strict check for OpenAI keys here.
// Validation happens lazily in createAgent.
/*
if (agentProvider === "openai") {
  if (!openaiBaseUrl) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_BASE_URL");
  if (!openaiApiKey) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_API_KEY");
  if (!openaiModel) throw new Error("BELLDANDY_AGENT_PROVIDER=openai requires BELLDANDY_OPENAI_MODEL");
}
*/
// Security Warning
if ((host === "0.0.0.0" || host === "::") && authMode === "none") {
    console.error("\n[SECURITY WARNING] Binding to all interfaces (0.0.0.0) without authentication!");
    console.error("Anyone on your network can access this agent. Please set BELLDANDY_AUTH_MODE in .env.\n");
}
// --- Initialization ---
// 1. Ensure state dir exists
if (!fs.existsSync(stateDir)) {
    try {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    catch {
        // ignore
    }
}
// 1.5 Ensure methods dir exists
const methodsDir = path.join(stateDir, "methods");
if (!fs.existsSync(methodsDir)) {
    try {
        fs.mkdirSync(methodsDir, { recursive: true });
    }
    catch {
        // ignore
    }
}
// 2. Init Memory (Singleton for server)
const memoryStore = new MemoryStore(memoryDbPath);
// 2.5 Init Embedding Provider (configured via env for MemoryManager)
const embeddingEnabled = readEnv("BELLDANDY_EMBEDDING_ENABLED") === "true";
if (embeddingEnabled && !openaiApiKey) {
    console.warn("Embedding: BELLDANDY_EMBEDDING_ENABLED=true but no OpenAI API key, skipping");
}
// 3. Init Executor (conditional)
const toolsToRegister = toolsEnabled
    ? [
        fetchTool,
        fileReadTool,
        fileWriteTool,
        fileDeleteTool,
        createMemorySearchTool(),
        createMemoryGetTool(),
        browserOpenTool,
        browserNavigateTool,
        browserClickTool,
        browserTypeTool,
        browserScreenshotTool,
        browserGetContentTool,
        cameraSnapTool,
        imageGenerateTool,
        textToSpeechTool,
        methodListTool,
        methodReadTool,
        methodCreateTool,
        methodSearchTool,
    ]
    : [];
const toolExecutor = new ToolExecutor({
    tools: toolsToRegister,
    workspaceRoot: stateDir, // Use ~/.belldandy as the workspace root for file operations
    policy: DEFAULT_POLICY, // TODO: Load from BELLDANDY_TOOLS_POLICY_FILE if needed
});
// 4. Log enabled tools
if (toolsEnabled) {
    console.log("Tools enabled: web_fetch, file_read, file_write, memory_search, memory_get, browser_*");
}
// 4.1 Initialize MCP and register MCP tools
if (mcpEnabled && toolsEnabled) {
    try {
        console.log("[MCP] 正在初始化 MCP 支持...");
        await initMCPIntegration();
        const registeredCount = registerMCPToolsToExecutor(toolExecutor);
        if (registeredCount > 0) {
            console.log(`[MCP] 已启用，注册了 ${registeredCount} 个 MCP 工具`);
        }
        printMCPStatus();
    }
    catch (err) {
        console.warn("[MCP] 初始化失败，MCP 工具将不可用:", err);
    }
}
else if (mcpEnabled && !toolsEnabled) {
    console.warn("[MCP] BELLDANDY_MCP_ENABLED=true 但 BELLDANDY_TOOLS_ENABLED=false，MCP 需要启用工具系统");
}
// 4.5 Auto-index memory files (MEMORY.md + memory/*.md)
await ensureMemoryDir(stateDir);
const memoryFilesResult = await listMemoryFiles(stateDir);
if (memoryFilesResult.files.length > 0) {
    console.log(`Memory: found ${memoryFilesResult.files.length} files (MEMORY.md=${memoryFilesResult.hasMainMemory}, daily=${memoryFilesResult.dailyCount})`);
    // Index memory files
    const indexer = new MemoryIndexer(memoryStore);
    for (const file of memoryFilesResult.files) {
        await indexer.indexFile(file.absPath);
    }
    console.log("Memory: files indexed");
}
else {
    console.log("Memory: no files found (run 'echo \"# Memory\" > ~/.belldandy/MEMORY.md' to create)");
}
// 5. Init Workspace (SOUL/Persona)
const workspaceResult = await ensureWorkspace({ dir: stateDir, createMissing: true });
if (workspaceResult.created.length > 0) {
    console.log(`Workspace: created ${workspaceResult.created.join(", ")}`);
}
// 6. Load Workspace files for system prompt
const workspace = await loadWorkspaceFiles(stateDir);
console.log(`Workspace: SOUL=${workspace.hasSoul}, IDENTITY=${workspace.hasIdentity}, USER=${workspace.hasUser}, BOOTSTRAP=${workspace.hasBootstrap}`);
// 7. Build dynamic system prompt
const dynamicSystemPrompt = buildSystemPrompt({
    workspace,
    extraSystemPrompt: openaiSystemPrompt,
    userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    currentTime: new Date().toISOString(),
});
// 8. Agent Factory (only for openai provider)
const createAgent = agentProvider === "openai"
    ? () => {
        // [MODIFIED] Lazy Check
        if (!openaiApiKey) {
            throw new Error("CONFIG_REQUIRED");
        }
        // Dynamic TTS Check
        const ttsEnabledPath = path.join(stateDir, "TTS_ENABLED");
        const isTtsEnabled = fs.existsSync(ttsEnabledPath);
        let currentSystemPrompt = dynamicSystemPrompt;
        if (isTtsEnabled) {
            currentSystemPrompt += `

## [SYSTEM MODE: VOICE/TTS ENABLED]
The user has enabled text-to-speech.
You MUST generate spoken audio for your response using the 'text_to_speech' tool.
Do this for every single message unless the user explicitly asks you to stop.
Use the 'edge' provider by default for free, high-quality speech.`;
        }
        if (toolsEnabled) {
            return new ToolEnabledAgent({
                baseUrl: openaiBaseUrl,
                apiKey: openaiApiKey,
                model: openaiModel,
                systemPrompt: currentSystemPrompt,
                toolExecutor: toolExecutor,
            });
        }
        return new OpenAIChatAgent({
            baseUrl: openaiBaseUrl,
            apiKey: openaiApiKey,
            model: openaiModel,
            stream: openaiStream,
            systemPrompt: currentSystemPrompt,
        });
    }
    : undefined;
const server = await startGatewayServer({
    port,
    host,
    auth: { mode: authMode, token: authToken, password: authPassword },
    webRoot,
    stateDir,
    agentFactory: createAgent,
    onActivity,
});
console.log(`Belldandy Gateway running: http://${server.host}:${server.port}`);
console.log(`WebChat: http://${server.host}:${server.port}/`);
console.log(`WS: ws://${server.host}:${server.port}`);
if (server.host === "0.0.0.0" || server.host === "::") {
    // Print LAN IPs for easier access from other machines
    const nets = os.networkInterfaces();
    console.log("Network Interfaces (Public Access):");
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`  -> http://${net.address}:${server.port}/`);
            }
        }
    }
}
else {
    console.log(`Access restricted to local machine (${server.host}).`);
    console.log(`To allow remote access, set BELLDANDY_HOST=0.0.0.0 in .env`);
}
console.log(`State Dir: ${stateDir}`);
console.log(`Memory DB: ${memoryDbPath}`);
console.log(`Tools Enabled: ${toolsEnabled}`);
// 8.5 Auto Open Browser (Magic Link)
const setupToken = readEnv("SETUP_TOKEN");
const autoOpenBrowser = readEnv("AUTO_OPEN_BROWSER") === "true";
if (autoOpenBrowser) {
    const openUrlHost = (server.host === "0.0.0.0" || server.host === "::") ? "localhost" : server.host;
    const targetUrl = `http://${openUrlHost}:${server.port}/${setupToken ? `?token=${setupToken}` : ""}`;
    console.log(`Launcher: Opening browser at ${targetUrl}...`);
    // Dynamic import to avoid issues if 'open' is optional or ESM
    try {
        const { default: open } = await import("open");
        await open(targetUrl);
    }
    catch (err) {
        console.error("Launcher: Failed to auto-open browser:", err);
        console.log(`Please open manually: ${targetUrl}`);
    }
}
// 9. Start Feishu Channel (if configured)
let feishuChannel;
if (feishuAppId && feishuAppSecret && createAgent) {
    try {
        const agent = createAgent();
        feishuChannel = new FeishuChannel({
            appId: feishuAppId,
            appSecret: feishuAppSecret,
            agent: agent,
            initialChatId: (() => {
                try {
                    const statePath = path.join(stateDir, "feishu-state.json");
                    if (fs.existsSync(statePath)) {
                        const data = JSON.parse(fs.readFileSync(statePath, "utf-8"));
                        if (data.lastChatId) {
                            console.log(`Feishu: Loaded persisted chat ID: ${data.lastChatId}`);
                            return data.lastChatId;
                        }
                    }
                }
                catch (e) {
                    console.error("Feishu: Failed to load state:", e);
                }
                return undefined;
            })(),
            onChatIdUpdate: (chatId) => {
                try {
                    const statePath = path.join(stateDir, "feishu-state.json");
                    const data = { lastChatId: chatId, updatedAt: Date.now() };
                    fs.writeFileSync(statePath, JSON.stringify(data, null, 2), "utf-8");
                    console.log(`Feishu: Persisted chat ID: ${chatId}`);
                }
                catch (e) {
                    console.error("Feishu: Failed to save state:", e);
                }
            },
        });
        // Do not await, start in background
        feishuChannel.start().catch((err) => {
            console.error("Feishu Channel Error:", err);
        });
    }
    catch (e) {
        console.warn("Feishu: Agent creation failed (likely missing config), skipping Feishu startup.");
    }
}
else if ((feishuAppId || feishuAppSecret) && !createAgent) {
    console.warn("Feishu Channel: Credentials present but no Agent configured (provider not openai?), skipping.");
}
// 10. Start Heartbeat Runner (if configured)
function parseIntervalMs(raw) {
    const match = /^(\d+)(m|h|s)?$/.exec(raw.trim().toLowerCase());
    if (!match)
        return 30 * 60 * 1000; // default 30m
    const value = parseInt(match[1], 10);
    const unit = match[2] || "m";
    switch (unit) {
        case "s": return value * 1000;
        case "m": return value * 60 * 1000;
        case "h": return value * 60 * 60 * 1000;
        default: return value * 60 * 1000;
    }
}
function parseActiveHours(raw) {
    if (!raw)
        return undefined;
    const match = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/.exec(raw.trim());
    if (!match)
        return undefined;
    return { start: match[1], end: match[2] };
}
let heartbeatRunner;
if (heartbeatEnabled && createAgent) {
    try {
        const heartbeatAgent = createAgent();
        const intervalMs = parseIntervalMs(heartbeatIntervalRaw);
        const activeHours = parseActiveHours(heartbeatActiveHoursRaw);
        // Helper to send message to agent and get response
        const sendMessage = async (prompt) => {
            let result = "";
            for await (const item of heartbeatAgent.run({
                conversationId: `heartbeat-${Date.now()}`,
                text: prompt,
            })) {
                if (item.type === "delta") {
                    result += item.delta;
                }
                else if (item.type === "final") {
                    result = item.text;
                }
            }
            return result;
        };
        // Helper to deliver message to user via Feishu and WebChat
        const deliverToUser = async (message) => {
            // 1. Broadcast to local WebChat (for local testing)
            server.broadcast({
                type: "event",
                event: "chat.final",
                payload: {
                    conversationId: "heartbeat-broadcast",
                    text: `❤️ [Heartbeat] ${message}`,
                },
            });
            // 2. Deliver to Feishu (if configured)
            if (feishuChannel) {
                console.log(`[heartbeat] Delivering to user via Feishu...`);
                const sent = await feishuChannel.sendProactiveMessage(message);
                if (!sent) {
                    console.warn(`[heartbeat] Failed to deliver: No active Feishu chat session (user needs to speak first).`);
                }
            }
            else {
                console.log(`[heartbeat] Broadcasted to local Web clients (Feishu disabled).`);
            }
        };
        heartbeatRunner = startHeartbeatRunner({
            intervalMs,
            workspaceDir: stateDir,
            sendMessage,
            deliverToUser,
            activeHours,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            isBusy,
            log: (msg) => console.log(msg),
        });
        console.log(`Heartbeat: enabled (interval=${heartbeatIntervalRaw}, activeHours=${heartbeatActiveHoursRaw ?? "all"})`);
    }
    catch (e) {
        console.warn("Heartbeat: Agent creation failed (likely missing config), skipping Heartbeat startup.");
    }
}
else if (heartbeatEnabled && !createAgent) {
    console.warn("Heartbeat: enabled but no Agent configured (provider not openai?), skipping.");
}
// 11. Start Browser Relay (if configured)
const browserRelayEnabled = readEnv("BELLDANDY_BROWSER_RELAY_ENABLED") === "true";
const browserRelayPort = Number(readEnv("BELLDANDY_RELAY_PORT") ?? "28892");
if (browserRelayEnabled) {
    const relay = new RelayServer(browserRelayPort);
    // Do not await, start in background
    relay.start().then(() => {
        console.log(`Browser Relay: enabled (port=${browserRelayPort})`);
    }).catch((err) => {
        console.error("Browser Relay Error:", err);
    });
}
//# sourceMappingURL=gateway.js.map