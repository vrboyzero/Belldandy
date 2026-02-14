const statusEl = document.getElementById("status");
const authModeEl = document.getElementById("authMode");
const authValueEl = document.getElementById("authValue");
const workspaceRootsEl = document.getElementById("workspaceRoots");
const connectBtn = document.getElementById("connect");
const sendBtn = document.getElementById("send");
const promptEl = document.getElementById("prompt");
const messagesEl = document.getElementById("messages");

// 文件树和编辑器 DOM 元素
const sidebarEl = document.getElementById("sidebar");
const sidebarTitleEl = document.querySelector(".sidebar-title");
const fileTreeEl = document.getElementById("fileTree");
const refreshTreeBtn = document.getElementById("refreshTree");
const chatSection = document.getElementById("chatSection");
const editorSection = document.getElementById("editorSection");
const editorPath = document.getElementById("editorPath");
const editorTextarea = document.getElementById("editorTextarea");
const composerSection = document.getElementById("composerSection");
const editorActions = document.getElementById("editorActions");
const cancelEditBtn = document.getElementById("cancelEdit");
const saveEditBtn = document.getElementById("saveEdit");

const STORE_KEY = "belldandy.webchat.auth";
const CLIENT_KEY = "belldandy.webchat.clientId";
const WORKSPACE_ROOTS_KEY = "belldandy.webchat.workspaceRoots";

let ws = null;
let isReady = false;
let activeConversationId = null;
let botMsgEl = null;
const pendingReq = new Map();
const clientId = resolveClientId();
let queuedText = null;

// 编辑器状态
let editorMode = false;
let currentEditPath = null;
let originalContent = null;
// Tree Mode: "root" | "facets"
let currentTreeMode = "root";
const expandedFolders = new Set();

// 附件状态
const attachmentsPreviewEl = document.getElementById("attachmentsPreview");
const attachBtn = document.getElementById("attachBtn");
const fileInput = document.getElementById("fileInput");
let pendingAttachments = []; // { name, type, mimeType, content }

// 侧边栏状态（默认收起）
let sidebarExpanded = false;
if (sidebarEl) {
  sidebarEl.classList.add("collapsed");
}

restoreAuth();
restoreWorkspaceRoots();
// [NEW] Allow ?token=... param to override/set auth
const urlParams = new URLSearchParams(window.location.search);
const urlToken = urlParams.get("token");
if (urlToken) {
  authModeEl.value = "token";
  authValueEl.value = urlToken;
}

setStatus("disconnected");

connectBtn.addEventListener("click", () => connect());
sendBtn.addEventListener("click", () => sendMessage());
promptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  // Auto-resize on keydown (for Shift+Enter immediately)
  setTimeout(() => {
    promptEl.style.height = "auto";
    promptEl.style.height = promptEl.scrollHeight + "px";
  }, 0);
});

promptEl.addEventListener("input", () => {
  // Auto-resize
  promptEl.style.height = "auto";
  promptEl.style.height = promptEl.scrollHeight + "px";
});

connect();

function setStatus(text) {
  statusEl.textContent = text;
  // Clear error hint if exists (it will be re-added by close handler if needed)
  const hint = document.getElementById("status-hint");
  if (hint) hint.remove();
}

function restoreAuth() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.mode) authModeEl.value = String(parsed.mode);
      if (parsed.value) authValueEl.value = String(parsed.value);
    }
  } catch {
    // ignore
  }
}

function persistAuth() {
  try {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ mode: authModeEl.value, value: authValueEl.value }),
    );
  } catch {
    // ignore
  }
}

function restoreWorkspaceRoots() {
  try {
    const saved = localStorage.getItem(WORKSPACE_ROOTS_KEY);
    if (saved && workspaceRootsEl) workspaceRootsEl.value = saved;
  } catch {
    // ignore
  }
}

function persistWorkspaceRoots() {
  try {
    if (workspaceRootsEl) {
      localStorage.setItem(WORKSPACE_ROOTS_KEY, workspaceRootsEl.value);
    }
  } catch {
    // ignore
  }
}

async function syncWorkspaceRoots() {
  if (!ws || !isReady || !workspaceRootsEl) return;
  const value = workspaceRootsEl.value.trim();
  if (!value) return;

  persistWorkspaceRoots();
  const id = makeId();
  await sendReq({
    type: "req",
    id,
    method: "config.update",
    params: { updates: { "BELLDANDY_EXTRA_WORKSPACE_ROOTS": value } }
  });
}

// 从服务器加载可操作区配置值
async function loadWorkspaceRootsFromServer() {
  if (!ws || !isReady || !workspaceRootsEl) return;

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "config.read",
  });

  if (res && res.ok && res.payload && res.payload.config) {
    const serverValue = res.payload.config["BELLDANDY_EXTRA_WORKSPACE_ROOTS"];
    if (serverValue && serverValue !== "[REDACTED]") {
      workspaceRootsEl.value = serverValue;
      persistWorkspaceRoots(); // 同步到 localStorage
    }
  }
}

// 保存按钮点击事件
const saveWorkspaceRootsBtn = document.getElementById("saveWorkspaceRoots");
if (saveWorkspaceRootsBtn) {
  saveWorkspaceRootsBtn.addEventListener("click", async () => {
    if (!ws || !isReady) {
      alert("请先连接到服务器");
      return;
    }

    const value = workspaceRootsEl ? workspaceRootsEl.value.trim() : "";

    // 保存到 localStorage
    persistWorkspaceRoots();

    // 更新 .env
    const id = makeId();
    const res = await sendReq({
      type: "req",
      id,
      method: "config.update",
      params: { updates: { "BELLDANDY_EXTRA_WORKSPACE_ROOTS": value } }
    });

    if (res && res.ok) {
      saveWorkspaceRootsBtn.innerHTML = "<u>已保存</u>";
      setTimeout(() => {
        saveWorkspaceRootsBtn.innerHTML = "<u>保存</u>";
      }, 1500);
    } else {
      const msg = res && res.error ? res.error.message : "保存失败";
      alert(`保存失败: ${msg}`);
    }
  });
}

function connect() {
  persistAuth();
  persistWorkspaceRoots();
  teardown();

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}`;
  ws = new WebSocket(url);
  isReady = false;
  sendBtn.disabled = true;
  setStatus("connecting");

  ws.addEventListener("open", () => {
    setStatus("connected (awaiting challenge)");
  });

  ws.addEventListener("close", () => {
    // Determine the URL we tried to connect to
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}`;

    setStatus(`disconnected (retrying ${url} in 3s...)`);
    if (!document.getElementById("status-hint")) {
      const hint = document.createElement("div");
      hint.id = "status-hint";
      hint.style.color = "#ff6b6b";
      hint.style.fontSize = "12px";
      hint.style.marginTop = "4px";
      hint.textContent = "If this persists in WSL, try accessing via IP (e.g. 172.x.x.x) instead of localhost.";
      statusEl.parentElement.appendChild(hint);
    }

    isReady = false;
    sendBtn.disabled = true;
    setTimeout(() => {
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 3000);
  });

  ws.addEventListener("message", (evt) => {
    const frame = safeJsonParse(evt.data);
    if (!frame || typeof frame !== "object") return;

    if (frame.type === "connect.challenge") {
      sendConnect();
      return;
    }

    if (frame.type === "hello-ok") {
      isReady = true;
      sendBtn.disabled = false;
      setStatus("ready");
      // 重置 token 累计
      sessionTotalTokens = 0;
      ["tuSys","tuCtx","tuIn","tuOut","tuAll"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = "--";
      });
      flushQueuedText();

      // 重连成功后隐藏重启倒计时浮层
      const restartOverlay = document.getElementById("restartOverlay");
      if (restartOverlay) restartOverlay.classList.add("hidden");

      // 如果侧边栏已展开，加载文件树
      if (sidebarExpanded) loadFileTree();

      // 从服务器加载当前配置并填充可操作区输入框
      loadWorkspaceRootsFromServer();

      // Check if we should play boot sequence
      if (!sessionStorage.getItem("booted")) {
        playBootSequence();
        sessionStorage.setItem("booted", "true");
      }
      return;
    }

    if (frame.type === "res") {
      const inflight = pendingReq.get(frame.id);
      if (inflight) {
        pendingReq.delete(frame.id);
        inflight.resolve(frame);
      }
      return;
    }

    if (frame.type === "event") {
      handleEvent(frame.event, frame.payload || {});
      return;
    }
  });
}

function teardown() {
  if (ws) {
    try {
      ws.close();
    } catch {
      // ignore
    }
  }
  ws = null;
  isReady = false;
}

async function playBootSequence() {
  const overlay = document.getElementById("awakening");
  const logEl = document.getElementById("bootLog");
  if (!overlay || !logEl) return;

  overlay.classList.remove("hidden");

  const logs = [
    "Initializing Neural Interface...",
    "Loading Core Memories... OK",
    "Establishing Secure Link... OK",
    "Syncing with Belldandy Gateway...",
    "User Identity Verified.",
    "System Online."
  ];

  for (const line of logs) {
    const p = document.createElement("div");
    p.className = "boot-line";
    p.textContent = `> ${line}`;
    logEl.appendChild(p);
    // Random delay for typing effect
    await new Promise(r => setTimeout(r, 100 + Math.random() * 300));
  }

  await new Promise(r => setTimeout(r, 800));
  overlay.classList.add("hidden");
}


function sendConnect() {
  if (!ws) return;
  const mode = authModeEl.value;
  const v = authValueEl.value.trim();
  const auth =
    mode === "token"
      ? { mode: "token", token: v.startsWith("setup-") ? v : (v.match(/^\d+-\d+$/) ? `setup-${v}` : v) }
      : mode === "password"
        ? { mode: "password", password: v }
        : { mode: "none" };

  ws.send(
    JSON.stringify({
      type: "connect",
      role: "web",
      clientId,
      auth,
      clientName: "belldandy-webchat",
      clientVersion: "0.0.0",
    }),
  );
}

async function sendMessage() {
  const text = promptEl.value.trim();
  if (!text) return;
  promptEl.value = "";

  if (!ws || !isReady) {
    queuedText = text;
    connect();
    return;
  }

  // ── 斜杠命令：/compact ──
  if (text === "/compact") {
    if (!activeConversationId) {
      appendMessage("bot", "当前没有活跃的对话，无法压缩上下文。");
      return;
    }
    appendMessage("me", "/compact");
    const statusEl = appendMessage("bot", "正在压缩上下文…");
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "context.compact",
      params: { conversationId: activeConversationId },
    });
    if (res && res.ok && res.payload) {
      const p = res.payload;
      if (p.compacted) {
        statusEl.textContent = `上下文压缩完成（${p.tier ?? "unknown"}）：${p.originalTokens ?? "?"} → ${p.compactedTokens ?? "?"} tokens`;
      } else {
        statusEl.textContent = "当前上下文较短，无需压缩。";
      }
    } else {
      statusEl.textContent = "压缩失败：" + (res?.error?.message || "未知错误");
    }
    return;
  }

  // ── 斜杠命令：/restart ──
  if (text === "/restart") {
    appendMessage("me", "/restart");
    const statusEl = appendMessage("bot", "正在重启服务…");
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.restart",
    });
    if (res && res.ok) {
      statusEl.textContent = "服务正在重启，请稍候…";
      setStatus("Restarting...");
    } else {
      statusEl.textContent = "重启失败：" + (res?.error?.message || "未知错误");
    }
    return;
  }

  // ── 斜杠命令：/doctor ──
  if (text === "/doctor") {
    appendMessage("me", "/doctor");
    const statusEl = appendMessage("bot", "正在执行健康检查…");
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.doctor",
    });
    if (res && res.ok && res.payload && res.payload.checks) {
      const lines = res.payload.checks.map(c => {
        const icon = c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌";
        return `${icon} ${c.name}: ${c.message}`;
      });
      statusEl.textContent = lines.join("\n");
    } else {
      statusEl.textContent = "健康检查失败：" + (res?.error?.message || "未知错误");
    }
    return;
  }

  appendMessage("me", text + (pendingAttachments.length ? ` [${pendingAttachments.length} 附件]` : ""));
  botMsgEl = appendMessage("bot", "");

  // 准备附件数据
  const attachments = pendingAttachments.map(att => {
    let base64 = "";
    if (typeof att.content === "string" && att.content.startsWith("data:")) {
      // Data URL (Image): strip prefix
      base64 = att.content.split(",")[1];
    } else {
      // Text content: convert to base64 (UTF-8 safe)
      try {
        base64 = window.btoa(unescape(encodeURIComponent(att.content)));
      } catch (e) {
        console.error("Base64 conversion failed for", att.name, e);
      }
    }
    return {
      name: att.name,
      type: att.mimeType || "application/octet-stream",
      base64
    };
  });

  pendingAttachments = [];
  renderAttachmentsPreview();

  const id = makeId();
  const payload = await sendReq({
    type: "req",
    id,
    method: "message.send",
    params: {
      conversationId: activeConversationId || undefined,
      text,
      from: "web",
      attachments,
    },
  });

  if (payload && payload.ok === false) {
    if (payload.error && payload.error.code === "pairing_required") {
      const msg = payload.error.message ? String(payload.error.message) : "Pairing required.";
      botMsgEl.textContent = `${msg}\n\n在本机执行：corepack pnpm pairing:approve <CODE>\n然后再发送一次消息。`;
      return;
    }
    if (payload.error && payload.error.code === "config_required") {
      botMsgEl.textContent = `❌ 配置缺失：${payload.error.message}\n请点击右上角设置图标（⚙️）完善配置。`;
      toggleSettings(true); // Auto open settings
      return;
    }
  }

  if (payload && payload.ok && payload.payload && payload.payload.conversationId) {
    activeConversationId = String(payload.payload.conversationId);
  }
}

// ... existing handleEvent ...

// --- Settings Logic ---
const settingsModal = document.getElementById("settingsModal");
const openSettingsBtn = document.getElementById("openSettings");
const closeSettingsBtn = document.getElementById("closeSettings");
const saveSettingsBtn = document.getElementById("saveSettings");
const restartBtn = document.getElementById("restartBtn");

const cfgApiKey = document.getElementById("cfgApiKey");
const cfgBaseUrl = document.getElementById("cfgBaseUrl");
const cfgModel = document.getElementById("cfgModel");
const cfgHeartbeat = document.getElementById("cfgHeartbeat");
const doctorStatusEl = document.getElementById("doctorStatus");

if (openSettingsBtn) {
  openSettingsBtn.addEventListener("click", () => toggleSettings(true));
}
if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener("click", () => toggleSettings(false));
}
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", saveConfig);
}
if (restartBtn) {
  restartBtn.addEventListener("click", restartServer);
}

function toggleSettings(show) {
  if (show) {
    settingsModal.classList.remove("hidden");
    loadConfig();
    runDoctor();
  } else {
    settingsModal.classList.add("hidden");
  }
}

async function loadConfig() {
  if (!ws || !isReady) return;
  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "config.read" });
  if (res && res.ok && res.payload && res.payload.config) {
    const c = res.payload.config;
    cfgApiKey.value = c["BELLDANDY_OPENAI_API_KEY"] || "";
    cfgBaseUrl.value = c["BELLDANDY_OPENAI_BASE_URL"] || "";
    cfgModel.value = c["BELLDANDY_OPENAI_MODEL"] || "";
    cfgHeartbeat.value = c["BELLDANDY_HEARTBEAT_INTERVAL"] || "";
  }
}

async function runDoctor() {
  if (!ws || !isReady) {
    doctorStatusEl.innerHTML = '<span class="badge fail">Disconnected</span>';
    return;
  }
  doctorStatusEl.innerHTML = '<span class="badge">Checking...</span>';

  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "system.doctor" });
  if (res && res.ok && res.payload && res.payload.checks) {
    doctorStatusEl.innerHTML = "";
    res.payload.checks.forEach(check => {
      const badge = document.createElement("span");
      badge.className = `badge ${check.status}`;
      badge.textContent = `${check.name}: ${check.message || check.status}`;
      doctorStatusEl.appendChild(badge);
    });
  } else {
    doctorStatusEl.innerHTML = '<span class="badge fail">Check Failed</span>';
  }
}

async function saveConfig() {
  if (!ws || !isReady) {
    alert("Error: Not connected to server.\nPlease refresh the page or check if the Gateway is running.");
    return;
  }
  saveSettingsBtn.textContent = "Saving...";
  saveSettingsBtn.disabled = true;

  const updates = {};
  if (cfgApiKey.value.trim()) updates["BELLDANDY_OPENAI_API_KEY"] = cfgApiKey.value.trim();
  if (cfgBaseUrl.value.trim()) updates["BELLDANDY_OPENAI_BASE_URL"] = cfgBaseUrl.value.trim();
  else if (!cfgBaseUrl.value) updates["BELLDANDY_OPENAI_BASE_URL"] = "https://api.openai.com/v1"; // Default?

  if (cfgModel.value.trim()) updates["BELLDANDY_OPENAI_MODEL"] = cfgModel.value.trim();
  if (cfgHeartbeat.value.trim()) updates["BELLDANDY_HEARTBEAT_INTERVAL"] = cfgHeartbeat.value.trim();

  // Set Provider to openai if key present (Lenient mode auto-enable)
  if (cfgApiKey.value.trim()) {
    updates["BELLDANDY_AGENT_PROVIDER"] = "openai";
  }

  const id = makeId();
  const res = await sendReq({ type: "req", id, method: "config.update", params: { updates } });

  if (res && res.ok) {
    saveSettingsBtn.textContent = "Saved";
    setTimeout(() => {
      saveSettingsBtn.textContent = "Save";
      saveSettingsBtn.disabled = false;
      alert("Configuration saved. Please restart server to apply changes.");
    }, 1000);
  } else {
    saveSettingsBtn.textContent = "Failed";
    saveSettingsBtn.disabled = false;
    alert("Save failed: " + (res.error ? res.error.message : "Unknown error"));
  }
}

async function restartServer() {
  if (!confirm("Are you sure you want to restart the server?")) return;
  if (!ws || !isReady) return;

  const id = makeId();
  await sendReq({ type: "req", id, method: "system.restart" });
  setStatus("Restarting...");
  ws.close();
  // setTimeout(() => location.reload(), 3000); // Rely on auto-reconnect
}

// ... existing helpers ...
function handleEvent(event, payload) {
  if (event === "pairing.required") {
    const code = payload && payload.code ? String(payload.code) : "";
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");
    botMsgEl.textContent =
      `需要配对（pairing）。配对码：${code}\n\n` +
      `在本机执行：corepack pnpm pairing:approve ${code}\n` +
      `然后再发送一次消息。`;
    return;
  }
  if (event === "agent.status") {
    if (payload && payload.status === "restarting" && payload.countdown !== undefined) {
      showRestartCountdown(payload.countdown, payload.reason || "");
    }
    // 运行中时给 token-usage 加 updating 样式
    const tuEl = document.getElementById("tokenUsage");
    if (tuEl && payload) {
      if (payload.status === "running") tuEl.classList.add("updating");
      else tuEl.classList.remove("updating");
    }
    return;
  }
  if (event === "token.usage") {
    updateTokenUsage(payload);
    return;
  }
  if (event === "chat.delta") {
    const delta = payload && payload.delta ? String(payload.delta) : "";
    if (!delta) return;
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");

    // [FIX] Use innerHTML to support audio tags and basic formatting
    // Note: Simple appending might break HTML structure during streaming, but strictly speaking
    // for <audio> tags at the start/end it usually works. 
    // Ideally we should re-render the whole markdown, but for now we trust the backend sends valid chunks.
    // However, += on innerHTML is bad for performance and can break open tags.
    // For now, let's just use the accumulative buffer logic if possible, or naive append.
    // Since we don't have the full text here easily without state, we might need to rely on the fact 
    // that `botMsgEl` is accumulating. 
    // BUT! `textContent +=` works for text. `innerHTML +=` re-parses everything.
    // Let's assume the delta is just text or complete tags for now.
    botMsgEl.innerHTML += delta;

    // 强制滚动到底部（测试模式）
    forceScrollToBottom();
    return;
  }
  if (event === "chat.final") {
    const text = payload && payload.text ? String(payload.text) : "";
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");

    // [FIX] Use innerHTML to support audio tags and basic formatting
    botMsgEl.innerHTML = text;

    // [NEW] Auto-play audio if present
    const audioEl = botMsgEl.querySelector("audio");
    if (audioEl) {
      audioEl.play().catch(err => {
        console.warn("Auto-play blocked:", err);
      });
    }

    // 强制滚动到底部（测试模式）
    // 强制滚动到底部（测试模式）
    forceScrollToBottom();
    return;
  }
}

function showRestartCountdown(countdown, reason) {
  const overlay = document.getElementById("restartOverlay");
  const countdownEl = document.getElementById("restartCountdown");
  const reasonEl = document.getElementById("restartReason");
  if (!overlay || !countdownEl) return;

  if (countdown > 0) {
    // 显示倒计时
    overlay.classList.remove("hidden");
    reasonEl.textContent = reason;
    countdownEl.textContent = String(countdown);
    // pulse 动画
    countdownEl.classList.remove("pulse");
    void countdownEl.offsetWidth; // force reflow
    countdownEl.classList.add("pulse");
  } else {
    // countdown === 0，服务即将断开
    countdownEl.textContent = "…";
    setStatus("Restarting…");
  }
}

function formatTokenCount(n) {
  if (n == null || n === 0) return "--";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

let sessionTotalTokens = 0;

function updateTokenUsage(payload) {
  if (!payload) return;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatTokenCount(val);
  };
  set("tuSys", payload.systemPromptTokens);
  set("tuCtx", payload.contextTokens);
  set("tuIn", payload.inputTokens);
  set("tuOut", payload.outputTokens);
  // 会话累计：每次收到 usage 事件，累加 input + output
  sessionTotalTokens += (payload.inputTokens || 0) + (payload.outputTokens || 0);
  set("tuAll", sessionTotalTokens);
  // 移除 updating 动画
  const tuEl = document.getElementById("tokenUsage");
  if (tuEl) tuEl.classList.remove("updating");
}

function flushQueuedText() {
  const text = queuedText;
  if (!text) return;
  queuedText = null;
  promptEl.value = text;
  sendMessage();
}

function appendMessage(kind, text) {
  const el = document.createElement("div");
  el.className = `msg ${kind}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  // 强制滚动到底部（测试模式）
  forceScrollToBottom();
  return el;
}

// ==================== 自动滚动逻辑 ====================

/** 检测滚动条是否接近底部 */
function isNearBottom(el, threshold = 100) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/** 如果用户在底部附近，自动滚动到最新消息 */
function scrollToBottomIfNeeded() {
  if (isNearBottom(chatSection)) {
    forceScrollToBottom();
  }
}

/** 强制滚动到底部 - 使用 chatSection 作为滚动容器 */
function forceScrollToBottom() {
  chatSection.scrollTop = chatSection.scrollHeight;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function makeId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sendReq(frame) {
  if (!ws) return Promise.resolve(null);
  ws.send(JSON.stringify(frame));
  return new Promise((resolve) => {
    pendingReq.set(frame.id, { resolve });
    setTimeout(() => {
      if (pendingReq.has(frame.id)) {
        pendingReq.delete(frame.id);
        resolve(null);
      }
    }, 30_000);
  });
}

function resolveClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_KEY);
    if (existing && existing.trim()) return existing.trim();
  } catch {
    // ignore
  }
  const id = makeId();
  try {
    localStorage.setItem(CLIENT_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

// ==================== 附件处理逻辑 ====================

// 附件按钮点击
if (attachBtn) {
  attachBtn.addEventListener("click", () => fileInput?.click());
}

// 文件选择
if (fileInput) {
  fileInput.addEventListener("change", () => {
    if (fileInput.files) handleFiles(fileInput.files);
    fileInput.value = ""; // 重置以允许再次选择相同文件
  });
}

// 拖拽支持 (composerSection 已在文件顶部声明)
if (composerSection) {
  composerSection.addEventListener("dragover", (e) => {
    e.preventDefault();
    composerSection.classList.add("drag-over");
  });
  composerSection.addEventListener("dragleave", () => {
    composerSection.classList.remove("drag-over");
  });
  composerSection.addEventListener("drop", (e) => {
    e.preventDefault();
    composerSection.classList.remove("drag-over");
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
  });
}

// 粘贴图片支持
promptEl.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) {
        // 剪贴板图片默认名无辨识度，加时间戳
        const ext = file.type.split("/")[1] || "png";
        const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
        const named = new File([file], `paste-${ts}.${ext}`, { type: file.type });
        files.push(named);
      }
    }
  }
  if (files.length > 0) {
    e.preventDefault();
    handleFiles(files);
  }
});

// 处理文件列表
async function handleFiles(files) {
  const allowedTypes = {
    image: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
    video: [".mp4", ".mov", ".avi", ".webm", ".mkv"],
    text: [".txt", ".md", ".json", ".log", ".js", ".ts", ".xml", ".html", ".css", ".csv"] // Added more text types
  };

  for (const file of files) {
    const ext = "." + file.name.split(".").pop().toLowerCase();
    const isImage = allowedTypes.image.includes(ext);
    const isVideo = allowedTypes.video.includes(ext);
    const isText = allowedTypes.text.includes(ext);

    if (!isImage && !isVideo && !isText) {
      console.warn(`不支持的文件类型: ${file.name}`);
      continue;
    }

    try {
      // Images and Videos are read as Base64 Data URL
      const content = await readFileContent(file, isImage || isVideo);
      pendingAttachments.push({
        name: file.name,
        type: isImage ? "image" : (isVideo ? "video" : "text"),
        mimeType: file.type || (isImage ? "image/png" : (isVideo ? "video/mp4" : "text/plain")),
        content
      });
    } catch (err) {
      console.error(`读取文件失败: ${file.name}`, err);
    }
  }

  renderAttachmentsPreview();
}

// 读取文件内容
function readFileContent(file, asBase64) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (asBase64) {
        // 返回完整的 data URL
        resolve(reader.result);
      } else {
        resolve(reader.result);
      }
    };
    reader.onerror = () => reject(reader.error);
    if (asBase64) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

// 渲染附件预览
function renderAttachmentsPreview() {
  if (!attachmentsPreviewEl) return;
  attachmentsPreviewEl.innerHTML = "";

  pendingAttachments.forEach((att, idx) => {
    const item = document.createElement("div");
    item.className = "attachment-item";

    if (att.type === "image") {
      const img = document.createElement("img");
      img.src = att.content;
      img.alt = att.name;
      item.appendChild(img);
    } else if (att.type === "video") {
      const icon = document.createElement("div");
      icon.className = "file-icon video-icon";
      icon.textContent = "🎬"; // Simple video icon
      icon.style.fontSize = "24px";
      item.appendChild(icon);
    } else {
      const icon = document.createElement("div");
      icon.className = "file-icon text-icon";
      icon.textContent = "📄";
      icon.style.fontSize = "24px";
      item.appendChild(icon);
    }

    const nameSpan = document.createElement("span");
    nameSpan.textContent = att.name.length > 15 ? att.name.slice(0, 12) + "..." : att.name;
    item.appendChild(nameSpan);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "×";
    removeBtn.onclick = () => {
      pendingAttachments.splice(idx, 1);
      renderAttachmentsPreview();
    };
    item.appendChild(removeBtn);

    attachmentsPreviewEl.appendChild(item);
  });
}

// ==================== 文件树和编辑器逻辑 ====================

// 侧边栏标题点击事件（展开/收起）
// 侧边栏标题点击事件（不再作为模式切换，仅展开/收起）
if (sidebarTitleEl) {
  sidebarTitleEl.addEventListener("click", () => toggleSidebar());
}

// 切换侧边栏展开/收起
function toggleSidebar() {
  sidebarExpanded = !sidebarExpanded;
  if (sidebarEl) {
    if (sidebarExpanded) {
      sidebarEl.classList.remove("collapsed");
      // 展开时加载文件树
      if (isReady) loadFileTree();
    } else {
      sidebarEl.classList.add("collapsed");
    }
  }
}

// 刷新按钮事件
if (refreshTreeBtn) {
  refreshTreeBtn.addEventListener("click", () => loadFileTree());
}

// 编辑器按钮事件
if (cancelEditBtn) {
  cancelEditBtn.addEventListener("click", () => cancelEdit());
}
if (saveEditBtn) {
  saveEditBtn.addEventListener("click", () => saveFile());
}

// 配置按钮事件
const openEnvEditorBtn = document.getElementById("openEnvEditor");
if (openEnvEditorBtn) {
  openEnvEditorBtn.addEventListener("click", () => openEnvFile());
}

// 导航按钮
const switchRootBtn = document.getElementById("switchRoot");
const switchFacetBtn = document.getElementById("switchFacet");

if (switchRootBtn) {
  switchRootBtn.addEventListener("click", () => switchTreeMode("root"));
}
if (switchFacetBtn) {
  switchFacetBtn.addEventListener("click", () => switchTreeMode("facets"));
}

// 切换文件树模式
function switchTreeMode(mode) {
  if (currentTreeMode === mode) {
    if (!sidebarExpanded) toggleSidebar();
    else loadFileTree();
    return;
  }

  currentTreeMode = mode;
  expandedFolders.clear();

  // 更新 UI 样式
  if (switchRootBtn) {
    if (mode === "root") {
      switchRootBtn.style.background = "rgba(255,255,255,0.1)";
      switchRootBtn.style.opacity = "1";
    } else {
      switchRootBtn.style.background = "transparent";
      switchRootBtn.style.opacity = "0.7";
    }
  }
  if (switchFacetBtn) {
    if (mode === "facets") {
      switchFacetBtn.style.background = "rgba(255,255,255,0.1)";
      switchFacetBtn.style.opacity = "1";
    } else {
      switchFacetBtn.style.background = "transparent";
      switchFacetBtn.style.opacity = "0.7";
    }
  }

  // 确保侧边栏展开
  if (!sidebarExpanded) {
    toggleSidebar();
  } else {
    loadFileTree();
  }
}

// 打开 .env 文件进行编辑
async function openEnvFile() {
  if (!ws || !isReady) {
    alert("未连接到服务器");
    return;
  }

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "config.readRaw",
  });

  if (!res || !res.ok) {
    const msg = res && res.error ? res.error.message : "读取失败";
    alert(`无法读取配置文件: ${msg}`);
    return;
  }

  currentEditPath = ".env";
  originalContent = res.payload.content;

  if (editorPath) editorPath.textContent = ".env (环境配置)";
  if (editorTextarea) editorTextarea.value = res.payload.content;

  switchMode("editor");
}

// 加载文件树
async function loadFileTree(folderPath = "") {
  if (!ws || !isReady) {
    if (fileTreeEl) fileTreeEl.innerHTML = '<div class="tree-loading">未连接</div>';
    return;
  }

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "workspace.list",
    params: { path: currentTreeMode === "facets" && !folderPath ? "facets" : folderPath },
  });

  if (!res || !res.ok || !res.payload || !res.payload.items) {
    if (fileTreeEl && !folderPath) {
      fileTreeEl.innerHTML = '<div class="tree-loading">加载失败</div>';
    }
    return [];
  }

  const items = res.payload.items;

  // 如果是根目录，渲染整个树
  if (!folderPath) {
    renderFileTree(items);
  }

  return items;
}

// 渲染文件树
function renderFileTree(items) {
  if (!fileTreeEl) return;

  fileTreeEl.innerHTML = "";

  if (items.length === 0) {
    fileTreeEl.innerHTML = '<div class="tree-loading">无文件</div>';
    return;
  }

  for (const item of items) {
    const el = createTreeItem(item);
    fileTreeEl.appendChild(el);
  }
}

// 创建树节点
function createTreeItem(item) {
  if (item.type === "directory") {
    const folder = document.createElement("div");
    folder.className = "tree-folder";
    if (expandedFolders.has(item.path)) {
      folder.classList.add("expanded");
    }

    const header = document.createElement("div");
    header.className = "tree-item";
    header.innerHTML = `
      <span class="tree-item-icon"></span>
      <span class="tree-item-name">${escapeHtml(item.name)}</span>
    `;
    header.addEventListener("click", () => toggleFolder(item.path, folder));

    const children = document.createElement("div");
    children.className = "tree-children";

    folder.appendChild(header);
    folder.appendChild(children);

    // 如果已展开，加载子项
    if (expandedFolders.has(item.path)) {
      loadFolderChildren(item.path, children);
    }

    return folder;
  } else {
    const file = document.createElement("div");
    file.className = "tree-file";

    const fileItem = document.createElement("div");
    fileItem.className = "tree-item";
    if (currentEditPath === item.path) {
      fileItem.classList.add("active");
    }
    fileItem.innerHTML = `
      <span class="tree-item-icon"></span>
      <span class="tree-item-name">${escapeHtml(item.name)}</span>
    `;
    fileItem.addEventListener("click", () => openFile(item.path));

    file.appendChild(fileItem);
    return file;
  }
}

// 展开/收起文件夹
async function toggleFolder(folderPath, folderEl) {
  if (expandedFolders.has(folderPath)) {
    expandedFolders.delete(folderPath);
    folderEl.classList.remove("expanded");
  } else {
    expandedFolders.add(folderPath);
    folderEl.classList.add("expanded");

    // 加载子项
    const children = folderEl.querySelector(".tree-children");
    if (children && children.children.length === 0) {
      await loadFolderChildren(folderPath, children);
    }
  }
}

// 加载文件夹子项
async function loadFolderChildren(folderPath, containerEl) {
  containerEl.innerHTML = '<div class="tree-loading" style="padding: 4px 8px; font-size: 12px;">...</div>';

  const items = await loadFileTree(folderPath);

  containerEl.innerHTML = "";

  if (!items || items.length === 0) {
    containerEl.innerHTML = '<div class="tree-loading" style="padding: 4px 8px; font-size: 12px; color: var(--text-muted);">空</div>';
    return;
  }

  for (const item of items) {
    const el = createTreeItem(item);
    containerEl.appendChild(el);
  }
}

// 打开文件进行编辑
async function openFile(filePath) {
  if (!ws || !isReady) {
    alert("未连接到服务器");
    return;
  }

  const id = makeId();
  const res = await sendReq({
    type: "req",
    id,
    method: "workspace.read",
    params: { path: filePath },
  });

  if (!res || !res.ok) {
    const msg = res && res.error ? res.error.message : "读取失败";
    alert(`无法读取文件: ${msg}`);
    return;
  }

  currentEditPath = filePath;
  originalContent = res.payload.content;

  if (editorPath) editorPath.textContent = filePath;
  if (editorTextarea) editorTextarea.value = res.payload.content;

  switchMode("editor");

  // 刷新文件树以更新 active 状态
  loadFileTree();
}

// 保存文件
async function saveFile() {
  if (!ws || !isReady) {
    alert("未连接到服务器");
    return;
  }

  if (!currentEditPath) {
    alert("没有正在编辑的文件");
    return;
  }

  const content = editorTextarea ? editorTextarea.value : "";

  if (saveEditBtn) {
    saveEditBtn.textContent = "保存中...";
    saveEditBtn.disabled = true;
  }

  const id = makeId();
  let res;

  // 如果是 .env 文件，使用 config.writeRaw
  if (currentEditPath === ".env") {
    res = await sendReq({
      type: "req",
      id,
      method: "config.writeRaw",
      params: { content },
    });
  } else {
    res = await sendReq({
      type: "req",
      id,
      method: "workspace.write",
      params: { path: currentEditPath, content },
    });
  }

  if (saveEditBtn) {
    saveEditBtn.disabled = false;
  }

  if (!res || !res.ok) {
    if (saveEditBtn) saveEditBtn.textContent = "保存";
    const msg = res && res.error ? res.error.message : "保存失败";
    alert(`保存失败: ${msg}`);
    return;
  }

  if (saveEditBtn) saveEditBtn.textContent = "已保存";

  setTimeout(() => {
    if (saveEditBtn) saveEditBtn.textContent = "保存";
    switchMode("chat");
    currentEditPath = null;
    originalContent = null;
    loadFileTree();
  }, 500);
}

// 取消编辑
function cancelEdit() {
  if (originalContent !== null && editorTextarea) {
    const currentContent = editorTextarea.value;
    if (currentContent !== originalContent) {
      if (!confirm("放弃修改？")) {
        return;
      }
    }
  }

  switchMode("chat");
  currentEditPath = null;
  originalContent = null;
  loadFileTree();
}

// 切换模式
function switchMode(mode) {
  editorMode = mode === "editor";

  if (editorMode) {
    // 编辑模式
    if (chatSection) chatSection.classList.add("hidden");
    if (editorSection) editorSection.classList.remove("hidden");
    if (composerSection) composerSection.classList.add("hidden");
    if (editorActions) editorActions.classList.remove("hidden");
  } else {
    // 聊天模式
    if (chatSection) chatSection.classList.remove("hidden");
    if (editorSection) editorSection.classList.add("hidden");
    if (composerSection) composerSection.classList.remove("hidden");
    if (editorActions) editorActions.classList.add("hidden");
  }
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
