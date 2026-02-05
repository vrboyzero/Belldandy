import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import express from "express";
import { WebSocketServer, type WebSocket } from "ws";

import { MockAgent, type BelldandyAgent, ConversationStore } from "@belldandy/agent";
import type {
  GatewayFrame,
  GatewayReqFrame,
  GatewayResFrame,
  GatewayEventFrame,
  MessageSendParams,
  ConnectRequestFrame,
  BelldandyRole,
  GatewayAuth,
} from "@belldandy/protocol";
import { ensurePairingCode, isClientAllowed, resolveStateDir } from "./security/store.js";
import type { BelldandyLogger } from "./logger/index.js";

export type GatewayServerOptions = {
  port: number;
  host?: string; // [NEW] Allow binding to specific host
  auth: {
    mode: "none" | "token" | "password";
    token?: string;
    password?: string;
  };
  webRoot: string;
  stateDir?: string;
  agentFactory?: () => BelldandyAgent;
  conversationStoreOptions?: { maxHistory?: number; ttlSeconds?: number };
  onActivity?: () => void;
  /** 可选：统一 Logger，未提供时使用 console */
  logger?: BelldandyLogger;
};

export type GatewayServer = {
  port: number;
  host: string;
  close: () => Promise<void>;
  broadcast: (frame: GatewayEventFrame) => void;
};

const DEFAULT_METHODS = [
  "message.send",
  "config.read",
  "config.update",
  "system.doctor",
  "system.restart",
  "workspace.list",
  "workspace.read",
  "workspace.write",
];
const DEFAULT_EVENTS = ["chat.delta", "chat.final", "agent.status", "pairing.required"];

export async function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer> {
  ensureWebRoot(opts.webRoot);

  const log = opts.logger
    ? { info: (m: string, msg: string, d?: unknown) => opts.logger!.info(m, msg, d), error: (m: string, msg: string, d?: unknown) => opts.logger!.error(m, msg, d) }
    : { info: (m: string, msg: string) => console.log(`[${m}] ${msg}`), error: (m: string, msg: string, d?: unknown) => console.error(`[${m}] ${msg}`, d ?? "") };

  const app = express();
  if (opts.stateDir) {
    const generatedDir = path.join(opts.stateDir, "generated");
    try {
      fs.mkdirSync(generatedDir, { recursive: true });
    } catch {
      // ignore
    }
    app.use("/generated", express.static(generatedDir));
    log.info("gateway", `Static: serving /generated -> ${generatedDir}`);
  }

  app.use(express.static(opts.webRoot));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(opts.webRoot, "index.html"));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // 初始化会话存储
  const conversationStore = new ConversationStore(opts.conversationStoreOptions);

  wss.on("connection", (ws, req) => {
    const ip = req.socket.remoteAddress;
    log.info("ws", `New connection from ${ip}`);

    ws.on("error", (err) => {
      log.error("ws", `Error (${ip}): ${err.message}`);
    });

    ws.on("close", (code, reason) => {
      log.info("ws", `Closed (${ip}): ${code} ${reason}`);
    });

    const state: ConnectionState = {
      connected: false,
      nonce: crypto.randomUUID(),
      sessionId: crypto.randomUUID(),
      role: "web",
      challengeSentAt: Date.now(),
    };

    sendFrame(ws, { type: "connect.challenge", nonce: state.nonce });

    const challengeTimer = setTimeout(() => {
      if (!state.connected) {
        safeClose(ws, 4401, "connect timeout");
      }
    }, 10_000);

    ws.on("message", async (data) => {
      // Activity Tracking
      opts.onActivity?.();

      const raw = typeof data === "string" ? data : data.toString("utf-8");
      const frame = safeParseFrame(raw);
      if (!frame) {
        safeClose(ws, 4400, "invalid frame");
        return;
      }

      if (!state.connected) {
        if (frame.type !== "connect") {
          sendRes(ws, {
            type: "res",
            id: crypto.randomUUID(),
            ok: false,
            error: { code: "not_connected", message: "Handshake required." },
          });
          return;
        }
        const accepted = acceptConnect(frame, opts.auth);
        if (!accepted.ok) {
          safeClose(ws, 4403, accepted.message);
          return;
        }
        clearTimeout(challengeTimer);
        state.connected = true;
        state.role = accepted.role;
        state.clientId = normalizeClientId(frame.clientId) ?? state.sessionId;
        sendFrame(ws, {
          type: "hello-ok",
          sessionId: state.sessionId,
          role: state.role,
          methods: DEFAULT_METHODS,
          events: DEFAULT_EVENTS,
        });
        return;
      }

      if (frame.type !== "req") {
        return;
      }

      const res = await handleReq(ws, frame, {
        clientId: state.clientId ?? state.sessionId,
        stateDir: opts.stateDir ?? resolveStateDir(),
        agentFactory: opts.agentFactory ?? (() => new MockAgent()),
        conversationStore,
      });
      if (res) sendRes(ws, res);
    });

    ws.on("close", () => {
      clearTimeout(challengeTimer);
    });
  });

  const host = opts.host ?? "127.0.0.1"; // Default to localhost for security
  await new Promise<void>((resolve) => server.listen(opts.port, host, resolve));

  const address = server.address();
  const port =
    typeof address === "object" && address && "port" in address ? Number(address.port) : opts.port;

  return {
    port,
    host,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
    broadcast: (frame: GatewayEventFrame) => {
      for (const client of wss.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify(frame));
        }
      }
    },
  };
}

type ConnectionState = {
  connected: boolean;
  nonce: string;
  sessionId: string;
  role: BelldandyRole;
  challengeSentAt: number;
  clientId?: string;
};

function acceptConnect(
  frame: ConnectRequestFrame,
  authCfg: GatewayServerOptions["auth"],
): { ok: true; role: BelldandyRole } | { ok: false; message: string } {
  const auth = frame.auth ?? { mode: "none" };
  const role = frame.role ?? "web";
  if (!isRole(role)) return { ok: false, message: "invalid role" };

  if (authCfg.mode === "none") return { ok: true, role };

  if (authCfg.mode === "token") {
    if (!authCfg.token) return { ok: false, message: "server auth misconfigured" };
    if (auth.mode !== "token") return { ok: false, message: "token required" };
    if (auth.token !== authCfg.token) return { ok: false, message: "invalid token" };
    return { ok: true, role };
  }

  if (authCfg.mode === "password") {
    if (!authCfg.password) return { ok: false, message: "server auth misconfigured" };
    if (auth.mode !== "password") return { ok: false, message: "password required" };
    if (auth.password !== authCfg.password) return { ok: false, message: "invalid password" };
    return { ok: true, role };
  }

  return { ok: false, message: "invalid auth mode" };
}

async function handleReq(
  ws: WebSocket,
  req: GatewayReqFrame,
  ctx: {
    clientId: string;
    stateDir: string;
    agentFactory: () => BelldandyAgent;
    conversationStore: ConversationStore;
  },
): Promise<GatewayResFrame | null> {
  const secureMethods = ["message.send", "config.read", "config.update", "system.restart", "system.doctor", "workspace.write"];
  if (secureMethods.includes(req.method)) {
    const allowed = await isClientAllowed({ clientId: ctx.clientId, stateDir: ctx.stateDir });
    if (!allowed) {
      const pairing = await ensurePairingCode({ clientId: ctx.clientId, stateDir: ctx.stateDir });
      sendEvent(ws, {
        type: "event",
        event: "pairing.required",
        payload: {
          clientId: ctx.clientId,
          code: pairing.code,
          message: "pairing required: approve this code to allow messages",
        },
      });
      return {
        type: "res",
        id: req.id,
        ok: false,
        error: { code: "pairing_required", message: `Pairing required. Code: ${pairing.code}` },
      };
    }
  }

  switch (req.method) {
    case "message.send": {
      const parsed = parseMessageSendParams(req.params);
      if (!parsed.ok) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: parsed.message } };
      }

      let agent: BelldandyAgent;
      try {
        agent = ctx.agentFactory();
      } catch (err: any) {
        if (err.message === "CONFIG_REQUIRED") {
          return {
            type: "res",
            id: req.id,
            ok: false,
            error: { code: "config_required", message: "API Key or configuration missing." },
          };
        }
        throw err;
      }

      const conversationId = parsed.value.conversationId ?? crypto.randomUUID();
      const history = ctx.conversationStore.getHistory(conversationId);
      ctx.conversationStore.addMessage(conversationId, "user", parsed.value.text);

      void (async () => {
        try {
          let fullResponse = "";
          for await (const item of agent.run({ conversationId, text: parsed.value.text, history })) {
            if (item.type === "status") {
              sendEvent(ws, { type: "event", event: "agent.status", payload: { conversationId, status: item.status } });
            }
            if (item.type === "delta") {
              fullResponse += item.delta;
              sendEvent(ws, { type: "event", event: "chat.delta", payload: { conversationId, delta: item.delta } });
            }
            if (item.type === "final") {
              fullResponse = item.text;
              sendEvent(ws, { type: "event", event: "chat.final", payload: { conversationId, text: item.text } });
            }
          }
          if (fullResponse) {
            ctx.conversationStore.addMessage(conversationId, "assistant", fullResponse);
          }
        } catch (err) {
          sendEvent(ws, { type: "event", event: "agent.status", payload: { conversationId, status: "error" } });
        }
      })();

      return { type: "res", id: req.id, ok: true, payload: { conversationId } };
    }

    case "config.read": {
      const envPath = path.join(process.cwd(), ".env.local");
      const config: Record<string, string> = {};
      try {
        if (fs.existsSync(envPath)) {
          const raw = fs.readFileSync(envPath, "utf-8");
          raw.split(/\r?\n/).forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith("#")) {
              const eq = trimmed.indexOf("=");
              if (eq > 0) {
                const key = trimmed.slice(0, eq).trim();
                let val = trimmed.slice(eq + 1).trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                  val = val.slice(1, -1);
                }
                config[key] = val;
              }
            }
          });
        }
      } catch (e) {
        // ignore
      }
      return { type: "res", id: req.id, ok: true, payload: { config } };
    }

    case "config.update": {
      const params = req.params as unknown as { updates: Record<string, string> } | undefined;
      const updates = params?.updates;
      if (!updates || typeof updates !== "object") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "Missing updates" } };
      }

      const envPath = path.join(process.cwd(), ".env.local");
      let lines: string[] = [];
      try {
        if (fs.existsSync(envPath)) {
          lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
        }
      } catch { }

      const newKeys = new Set(Object.keys(updates));
      const nextLines: string[] = [];
      const handledKeys = new Set<string>();

      for (const line of lines) {
        const trimmed = line.trim();
        let matched = false;
        if (trimmed && !trimmed.startsWith("#")) {
          const eq = trimmed.indexOf("=");
          if (eq > 0) {
            const key = trimmed.slice(0, eq).trim();
            if (newKeys.has(key)) {
              const val = updates[key];
              nextLines.push(`${key}="${val}"`);
              handledKeys.add(key);
              matched = true;
            }
          }
        }
        if (!matched) nextLines.push(line);
      }

      for (const key of newKeys) {
        if (!handledKeys.has(key)) {
          if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push("");
          nextLines.push(`${key}="${updates[key]}"`);
        }
      }

      try {
        if (nextLines.length > 0 && nextLines[nextLines.length - 1] !== "") nextLines.push(""); // End with newline
        fs.writeFileSync(envPath, nextLines.join("\n"), "utf-8");
      } catch (e) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: String(e) } };
      }
      return { type: "res", id: req.id, ok: true };
    }

    case "system.restart": {
      setTimeout(() => {
        process.exit(100);
      }, 500);
      return { type: "res", id: req.id, ok: true };
    }

    case "system.doctor": {
      const checks: any[] = [
        { id: "node", name: "Node.js Environment", status: "pass", message: process.version },
        { id: "memory_db", name: "Vector Database", status: "pass", message: "OK" },
      ];

      const dbPath = path.join(ctx.stateDir, "memory.db");
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        checks[1].message = `Size: ${(stat.size / 1024).toFixed(1)} KB`;
      } else {
        checks[1].status = "warn";
        checks[1].message = "Not created yet";
      }

      try {
        ctx.agentFactory();
        checks.push({ id: "agent_config", name: "Agent Configuration", status: "pass", message: "Valid" });
      } catch {
        checks.push({ id: "agent_config", name: "Agent Configuration", status: "fail", message: "Missing API Keys" });
      }

      return { type: "res", id: req.id, ok: true, payload: { checks } };
    }

    case "workspace.list": {
      const params = req.params as { path?: string } | undefined;
      const relativePath = params?.path ?? "";
      
      // 验证路径安全性
      const targetDir = path.resolve(ctx.stateDir, relativePath);
      if (!targetDir.startsWith(ctx.stateDir)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_path", message: "路径越界" } };
      }

      // 检查目录是否存在
      if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "目录不存在" } };
      }

      // 允许的文件扩展名
      const ALLOWED_EXTENSIONS = [".md", ".json", ".txt"];
      // 忽略的目录和文件
      const IGNORED_NAMES = ["generated", "memory.db", ".DS_Store", "node_modules"];

      try {
        const entries = fs.readdirSync(targetDir, { withFileTypes: true });
        const items: Array<{ name: string; type: "file" | "directory"; path: string }> = [];

        for (const entry of entries) {
          // 忽略隐藏文件（以.开头，但排除 .belldandy 自身）
          if (entry.name.startsWith(".") && relativePath !== "") continue;
          // 忽略特定名称
          if (IGNORED_NAMES.includes(entry.name)) continue;

          const itemRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            items.push({ name: entry.name, type: "directory", path: itemRelPath });
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (ALLOWED_EXTENSIONS.includes(ext)) {
              items.push({ name: entry.name, type: "file", path: itemRelPath });
            }
          }
        }

        // 排序：文件夹在前，然后按名称排序
        items.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        return { type: "res", id: req.id, ok: true, payload: { items } };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(err) } };
      }
    }

    case "workspace.read": {
      const params = req.params as { path?: string } | undefined;
      const relativePath = params?.path;
      
      if (!relativePath || typeof relativePath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }

      // 验证路径安全性
      const targetFile = path.resolve(ctx.stateDir, relativePath);
      if (!targetFile.startsWith(ctx.stateDir)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_path", message: "路径越界" } };
      }

      // 检查文件扩展名
      const ALLOWED_EXTENSIONS = [".md", ".json", ".txt"];
      const ext = path.extname(targetFile).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_type", message: "不支持的文件类型" } };
      }

      // 检查文件是否存在
      if (!fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
        return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "文件不存在" } };
      }

      try {
        const content = fs.readFileSync(targetFile, "utf-8");
        return { type: "res", id: req.id, ok: true, payload: { content, path: relativePath } };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "read_failed", message: String(err) } };
      }
    }

    case "workspace.write": {
      const params = req.params as { path?: string; content?: string } | undefined;
      const relativePath = params?.path;
      const content = params?.content;
      
      if (!relativePath || typeof relativePath !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "path is required" } };
      }
      if (typeof content !== "string") {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_params", message: "content is required" } };
      }

      // 验证路径安全性
      const targetFile = path.resolve(ctx.stateDir, relativePath);
      if (!targetFile.startsWith(ctx.stateDir)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_path", message: "路径越界" } };
      }

      // 检查文件扩展名
      const ALLOWED_EXTENSIONS = [".md", ".json", ".txt"];
      const ext = path.extname(targetFile).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { type: "res", id: req.id, ok: false, error: { code: "invalid_type", message: "不支持的文件类型" } };
      }

      try {
        // 确保父目录存在
        const parentDir = path.dirname(targetFile);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
        }

        // 原子写入：先写临时文件再 rename
        const tmpFile = `${targetFile}.${crypto.randomUUID()}.tmp`;
        fs.writeFileSync(tmpFile, content, "utf-8");
        fs.renameSync(tmpFile, targetFile);

        return { type: "res", id: req.id, ok: true, payload: { path: relativePath } };
      } catch (err) {
        return { type: "res", id: req.id, ok: false, error: { code: "write_failed", message: String(err) } };
      }
    }
  }

  return { type: "res", id: req.id, ok: false, error: { code: "not_found", message: "Unknown method." } };
}


function parseMessageSendParams(value: unknown): { ok: true; value: MessageSendParams } | { ok: false; message: string } {
  if (!value || typeof value !== "object") return { ok: false, message: "params must be an object" };
  const obj = value as Record<string, unknown>;
  const text = typeof obj.text === "string" ? obj.text : "";
  if (!text.trim()) return { ok: false, message: "text is required" };
  const conversationId =
    typeof obj.conversationId === "string" && obj.conversationId.trim() ? obj.conversationId.trim() : undefined;
  const from = typeof obj.from === "string" && obj.from.trim() ? obj.from.trim() : undefined;
  return { ok: true, value: { text, conversationId, from } };
}

function safeParseFrame(raw: string): GatewayFrame | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const type = obj.type;
  if (type === "connect") {
    const role = typeof obj.role === "string" ? obj.role : "web";
    const auth = parseAuth(obj.auth);
    const clientId = typeof obj.clientId === "string" ? obj.clientId : undefined;
    return {
      type: "connect",
      role: isRole(role) ? role : "web",
      clientId,
      auth,
      clientName: typeof obj.clientName === "string" ? obj.clientName : undefined,
      clientVersion: typeof obj.clientVersion === "string" ? obj.clientVersion : undefined,
    };
  }
  if (type === "req") {
    const id = typeof obj.id === "string" ? obj.id : "";
    const method = typeof obj.method === "string" ? obj.method : "";
    if (!id || !method) return null;
    return { type: "req", id, method, params: (obj.params ?? undefined) as any };
  }
  return null;
}

function parseAuth(value: unknown): GatewayAuth {
  if (!value || typeof value !== "object") return { mode: "none" };
  const obj = value as Record<string, unknown>;
  const mode = obj.mode;
  if (mode === "token") {
    const token = typeof obj.token === "string" ? obj.token : "";
    return { mode: "token", token };
  }
  if (mode === "password") {
    const password = typeof obj.password === "string" ? obj.password : "";
    return { mode: "password", password };
  }
  return { mode: "none" };
}

function isRole(value: string): value is BelldandyRole {
  return value === "web" || value === "cli" || value === "node";
}

function normalizeClientId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

function sendRes(ws: WebSocket, frame: GatewayResFrame) {
  sendFrame(ws, frame);
}

function sendEvent(ws: WebSocket, frame: GatewayEventFrame) {
  sendFrame(ws, frame);
}

function sendFrame(ws: WebSocket, frame: GatewayFrame) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(frame));
}

function safeClose(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch {
    // ignore
  }
}

function ensureWebRoot(webRoot: string) {
  const stat = (() => {
    try {
      return fs.statSync(webRoot);
    } catch {
      return null;
    }
  })();
  if (!stat || !stat.isDirectory()) {
    throw new Error(`Invalid webRoot: ${webRoot}`);
  }
}
