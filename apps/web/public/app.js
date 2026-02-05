const statusEl = document.getElementById("status");
const authModeEl = document.getElementById("authMode");
const authValueEl = document.getElementById("authValue");
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
const expandedFolders = new Set();

// 侧边栏状态（默认收起）
let sidebarExpanded = false;
if (sidebarEl) {
  sidebarEl.classList.add("collapsed");
}

restoreAuth();
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

function connect() {
  persistAuth();
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
      flushQueuedText();

      // 如果侧边栏已展开，加载文件树
      if (sidebarExpanded) loadFileTree();

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

  appendMessage("me", text);
  botMsgEl = appendMessage("bot", "");

  const id = makeId();
  const payload = await sendReq({
    type: "req",
    id,
    method: "message.send",
    params: {
      conversationId: activeConversationId || undefined,
      text,
      from: "web",
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
  if (event === "chat.delta") {
    const delta = payload && payload.delta ? String(payload.delta) : "";
    if (!delta) return;
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");
    botMsgEl.textContent += delta;
    return;
  }
  if (event === "chat.final") {
    const text = payload && payload.text ? String(payload.text) : "";
    if (!botMsgEl) botMsgEl = appendMessage("bot", "");
    botMsgEl.textContent = text;
    return;
  }
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
  return el;
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

// ==================== 文件树和编辑器逻辑 ====================

// 侧边栏标题点击事件（展开/收起）
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
    params: { path: folderPath },
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
  const res = await sendReq({
    type: "req",
    id,
    method: "workspace.write",
    params: { path: currentEditPath, content },
  });

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
