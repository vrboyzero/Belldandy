const DEFAULT_PORT = 28892;

/** @type {WebSocket|null} */
let relayWs = null;
/** @type {Promise<void>|null} */
let relayConnectPromise = null;

// 存储 Tab 与 Session 的映射
const tabs = new Map(); // tabId -> { sessionId, targetId, state }
const tabBySession = new Map(); // sessionId -> tabId

async function getRelayPort() {
    const stored = await chrome.storage.local.get(['relayPort']);
    const n = parseInt(stored.relayPort, 10);
    return (Number.isFinite(n) && n > 0) ? n : DEFAULT_PORT;
}

// 连接到 Relay Server
async function ensureRelayConnection() {
    if (relayWs && relayWs.readyState === WebSocket.OPEN) return;
    if (relayConnectPromise) return await relayConnectPromise;

    relayConnectPromise = (async () => {
        const port = await getRelayPort();
        const wsUrl = `ws://127.0.0.1:${port}/extension`;

        console.log(`[Belldandy] Connecting to Relay at ${wsUrl}...`);

        try {
            const ws = new WebSocket(wsUrl);
            relayWs = ws;

            await new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error("Timeout")), 5000);
                ws.onopen = () => { clearTimeout(t); resolve(); };
                ws.onerror = () => { clearTimeout(t); reject(new Error("Connection Failed")); };
            });
            console.log("[Belldandy] Relay Connected");

            ws.onmessage = (event) => onRelayMessage(event.data);
            ws.onclose = () => {
                console.log("[Belldandy] Relay Disconnected");
                relayWs = null;
            };

            // 监听 Debugger 事件
            chrome.debugger.onEvent.addListener(onDebuggerEvent);
            chrome.debugger.onDetach.addListener(onDebuggerDetach);
        } catch (err) {
            console.error("[Belldandy] Connection Error:", err);
            relayWs = null;
            throw err;
        } finally {
            relayConnectPromise = null;
        }
    })();

    return relayConnectPromise;
}

// 处理来自 Relay 的消息
async function onRelayMessage(data) {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }

    if (msg.method === "ping") {
        relayWs?.send(JSON.stringify({ method: "pong" }));
        return;
    }

    if (msg.method === "forwardCDPCommand" && msg.params) {
        const { method, params, sessionId } = msg.params;
        const id = msg.id;

        try {
            const result = await handleCdpCommand(method, params, sessionId);
            relayWs?.send(JSON.stringify({ id, result }));
        } catch (err) {
            relayWs?.send(JSON.stringify({ id, error: err.message }));
        }
    }
}

// 执行 CDP 指令
async function handleCdpCommand(method, params, sessionId) {
    // 1. 查找目标 Tab
    let tabId;
    if (sessionId) {
        tabId = tabBySession.get(sessionId);
    } else {
        // 如果没有指定 sessionId，尝试查找当前已连接的一个 Tab，或者激活的 Tab
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (active) tabId = active.id;
    }

    if (!tabId) throw new Error("No target tab found");

    // special case: Target.createTarget
    if (method === "Target.createTarget") {
        const url = params?.url || "about:blank";
        const tab = await chrome.tabs.create({ url, active: false });
        // NOTE: Puppeteer expects { targetId }
        return { targetId: String(tab.id) };
    }

    // special case: Target.attachToTarget
    if (method === "Target.attachToTarget") {
        const targetIdStr = params?.targetId;
        const flatten = params?.flatten; // Puppeteer uses flatten:true

        let tabId;
        if (targetIdStr === "page-1") {
            // Resolve "page-1" alias to current active tab
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!active) throw new Error("No active tab found for alias page-1");
            tabId = active.id;
        } else {
            tabId = parseInt(targetIdStr, 10);
        }

        if (!tabId || isNaN(tabId)) throw new Error(`Invalid targetId: ${targetIdStr}`);

        // Check if already attached
        let existingInfo = tabs.get(tabId);
        if (existingInfo && existingInfo.state === "attached") {
            // Re-emit event for new clients (like Puppeteer) who need to see the attachment happen
            // especially if they are asking for an alias like "page-1"
            sendEventToRelay("Target.attachedToTarget", {
                sessionId: existingInfo.sessionId,
                targetInfo: {
                    targetId: targetIdStr, // Use "page-1" if that was requested
                    type: "page",
                    url: "",
                    title: "",
                    attached: true
                },
                waitingForDebugger: false
            });
            return { sessionId: existingInfo.sessionId };
        }

        await chrome.debugger.attach({ tabId }, "1.3");
        const newSessionId = `session-${tabId}-${Date.now()}`;

        tabs.set(tabId, { sessionId: newSessionId, targetId: String(tabId), state: "attached" });
        tabBySession.set(newSessionId, tabId);

        // Required by Puppeteer to confirm attachment
        // CRITICAL: We must use the SAME targetId that Puppeteer used to request attachment
        // otherwise Puppeteer won't recognize this session belongs to the target it just discovered.
        sendEventToRelay("Target.attachedToTarget", {
            sessionId: newSessionId,
            targetInfo: {
                targetId: targetIdStr, // Use "page-1" if that was requested
                type: "page",
                url: "",
                title: "",
                attached: true
            },
            waitingForDebugger: false
        });

        return { sessionId: newSessionId };
    }

    // special case: Target.closeTarget
    if (method === "Target.closeTarget") {
        const targetIdStr = params?.targetId;
        const tabId = parseInt(targetIdStr, 10);
        if (tabId) {
            await chrome.tabs.remove(tabId);
            return { success: true };
        }
    }

    // 2. 确保已 Attach
    // 如果是普通指令（非 attach/create），必须基于 session 或 tabId
    // ... logic continues ...
    let tabInfo = tabs.get(tabId);
    if (!tabInfo) {
        // Auto-attach if missing (fallback for direct commands)
        // ... (existing auto-attach logic) ...

        await chrome.debugger.attach({ tabId }, "1.3");
        const generatedSessionId = `session-${tabId}-${Date.now()}`;
        tabInfo = { sessionId: generatedSessionId, targetId: String(tabId), state: "attached" };
        tabs.set(tabId, tabInfo);
        tabBySession.set(generatedSessionId, tabId);

        // 通知 Relay 已连接
        sendEventToRelay("Target.attachedToTarget", {
            sessionId: generatedSessionId,
            targetInfo: { targetId: String(tabId), type: "page", url: "", title: "", attached: true },
            waitingForDebugger: false
        });
    }

    // 3. 发送指令
    const debuggee = { tabId };
    // 注意：如果有 sessionId，chrome.debugger.sendCommand 不需要传 sessionId 参数给 Chrome，
    // 因为 debuggee 对象中的 tabId 已经确定了目标。
    // 但是如果是 Flat 模式（Target.attachToTarget 后的子 Session），则需要 extensionId? 不，chrome.debugger 不支持 raw session ID。
    // Chrome Extension Debugger API 是基于 tabId 的。
    // Moltbot 的实现比较复杂，处理了 Target.attachToTarget。
    // 简化版：我们只支持直接控制 Tab。

    return await chrome.debugger.sendCommand(debuggee, method, params);
}

// 转发 Debugger 事件给 Relay
function onDebuggerEvent(source, method, params) {
    const tabId = source.tabId;
    const tabInfo = tabs.get(tabId);
    const sessionId = tabInfo?.sessionId;

    sendEventToRelay(method, params, sessionId);
}

function onDebuggerDetach(source, reason) {
    const tabId = source.tabId;
    const tabInfo = tabs.get(tabId);
    if (tabInfo) {
        sendEventToRelay("Target.detachedFromTarget", { sessionId: tabInfo.sessionId }, tabInfo.sessionId);
        tabs.delete(tabId);
        tabBySession.delete(tabInfo.sessionId);
    }
}

function sendEventToRelay(method, params, sessionId) {
    if (relayWs && relayWs.readyState === WebSocket.OPEN) {
        relayWs.send(JSON.stringify({
            method: "forwardCDPEvent",
            params: { method, params, sessionId }
        }));
    }
}

// 点击图标时连接
chrome.action.onClicked.addListener(async () => {
    try {
        await ensureRelayConnection();
        // 主动 attach 当前 tab
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (active) {
            handleCdpCommand("Page.enable", {}, null); // 触发 attach 逻辑
        }
    } catch (e) {
        console.error(e);
    }
});
