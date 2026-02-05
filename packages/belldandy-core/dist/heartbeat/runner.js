/**
 * Heartbeat Runner - 心跳定时任务系统
 *
 * 定期读取 HEARTBEAT.md 并触发 Agent 检查任务
 * 对标 Moltbot 实现：支持时区感知、状态持久化、消息去重、忙碌检测
 */
import fs from "node:fs/promises";
import path from "node:path";
import { isHeartbeatContentEffectivelyEmpty, isHeartbeatOkResponse, stripHeartbeatToken, DEFAULT_HEARTBEAT_PROMPT, HEARTBEAT_OK_TOKEN, } from "./content.js";
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟
const HEARTBEAT_FILENAME = "HEARTBEAT.md";
const STATE_FILENAME = "heartbeat-state.json";
/**
 * 解析 HH:MM 时间
 */
function parseTime(time) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match)
        return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59)
        return null;
    // Handle 24:00
    if (hours === 24 && minutes === 0)
        return 24 * 60;
    if (hours === 24)
        return null;
    return hours * 60 + minutes;
}
/**
 * 以指定时区获取当前时间的分钟数 (0-1440)
 */
function resolveMinutesInTimeZone(now, timeZone) {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).formatToParts(new Date(now));
        const map = {};
        for (const part of parts) {
            if (part.type !== "literal")
                map[part.type] = part.value;
        }
        const hour = Number(map.hour);
        const minute = Number(map.minute);
        if (!Number.isFinite(hour) || !Number.isFinite(minute))
            return null;
        return hour * 60 + minute;
    }
    catch {
        return null; // Invalid timezone
    }
}
/**
 * 检查活跃时段 (Moltbot compatible)
 */
function isWithinActiveHours(now, activeHours, timezone) {
    if (!activeHours)
        return true;
    const startMin = parseTime(activeHours.start);
    const endMin = parseTime(activeHours.end);
    if (startMin === null || endMin === null)
        return true;
    // Resolve timezone
    let tz = timezone?.trim() || "local";
    if (tz === "local") {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    }
    // "user" usually handled by caller passing user timezone, treating unknown as local fallback check below
    let currentMin = resolveMinutesInTimeZone(now, tz);
    if (currentMin === null) {
        // Fallback to simple local date if timezone invalid
        const d = new Date(now);
        currentMin = d.getHours() * 60 + d.getMinutes();
    }
    if (endMin > startMin) {
        return currentMin >= startMin && currentMin < endMin;
    }
    else {
        // Cross midnight (e.g. 22:00 - 06:00)
        return currentMin >= startMin || currentMin < endMin;
    }
}
/**
 * 持久化状态管理
 */
async function loadState(dir) {
    try {
        const content = await fs.readFile(path.join(dir, STATE_FILENAME), "utf-8");
        return JSON.parse(content);
    }
    catch {
        return { lastRunAt: 0 };
    }
}
async function saveState(dir, state) {
    try {
        await fs.writeFile(path.join(dir, STATE_FILENAME), JSON.stringify(state, null, 2), "utf-8");
    }
    catch {
        // ignore write error
    }
}
export function startHeartbeatRunner(options) {
    const { intervalMs = DEFAULT_INTERVAL_MS, workspaceDir, sendMessage, deliverToUser, prompt = DEFAULT_HEARTBEAT_PROMPT, activeHours, timezone, isBusy, log = console.log, } = options;
    let timer = null;
    let stopped = false;
    const runOnce = async () => {
        const startedAt = Date.now();
        // 0. Queue Awareness: Check busy
        if (isBusy && isBusy()) {
            log(`[heartbeat] skipped: system is busy`);
            return { status: "skipped", reason: "requests-in-flight" };
        }
        // 1. Timezone & Active Hours
        if (!isWithinActiveHours(startedAt, activeHours, timezone)) {
            // Log less frequently? No, logging skipped is fine for debugging.
            // But to avoid log spam, maybe only debug log. Using provided log function.
            log(`[heartbeat] skipped: outside active hours`);
            return { status: "skipped", reason: "quiet-hours" };
        }
        // 2. Read HEARTBEAT.md
        const heartbeatPath = path.join(workspaceDir, HEARTBEAT_FILENAME);
        let content;
        try {
            content = await fs.readFile(heartbeatPath, "utf-8");
        }
        catch (err) {
            log(`[heartbeat] skipped: HEARTBEAT.md not found`);
            return { status: "skipped", reason: "file-not-found" };
        }
        if (isHeartbeatContentEffectivelyEmpty(content)) {
            log(`[heartbeat] skipped: HEARTBEAT.md is empty`);
            return { status: "skipped", reason: "empty-heartbeat-file" };
        }
        // 3. Execute
        log(`[heartbeat] running...`);
        let response;
        try {
            response = await sendMessage(prompt);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log(`[heartbeat] failed: ${message}`);
            return { status: "failed", reason: message };
        }
        const durationMs = Date.now() - startedAt;
        // 4. Handle Response
        if (isHeartbeatOkResponse(response)) {
            log(`[heartbeat] ok (${durationMs}ms)`);
            return { status: "ran", reason: "ok", durationMs };
        }
        const cleanedResponse = stripHeartbeatToken(response);
        if (!cleanedResponse) {
            return { status: "ran", reason: "ok-empty", durationMs };
        }
        // 5. Deduplication (Anti-Nagging)
        const state = await loadState(workspaceDir);
        const prevText = state.lastHeartbeatText || "";
        const prevTime = state.lastHeartbeatSentAt || 0;
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        // 如果内容完全对等，且距离上次发送不足 24 小时 -> 跳过
        if (prevText.trim() === cleanedResponse.trim() &&
            (Date.now() - prevTime) < ONE_DAY_MS) {
            log(`[heartbeat] skipped: duplicate content (deduplication active)`);
            return { status: "skipped", reason: "duplicate", message: cleanedResponse };
        }
        // 6. Deliver
        if (deliverToUser) {
            try {
                await deliverToUser(cleanedResponse);
                log(`[heartbeat] delivered to user (${durationMs}ms)`);
                // Update State
                state.lastHeartbeatText = cleanedResponse;
                state.lastHeartbeatSentAt = Date.now();
                await saveState(workspaceDir, state);
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log(`[heartbeat] delivery failed: ${message}`);
            }
        }
        // Update run time
        state.lastRunAt = Date.now();
        await saveState(workspaceDir, state);
        return {
            status: "ran",
            durationMs,
            message: cleanedResponse,
        };
    };
    const scheduleNext = () => {
        if (stopped)
            return;
        timer = setInterval(async () => {
            if (stopped)
                return;
            try {
                await runOnce();
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                log(`[heartbeat] error: ${message}`);
            }
        }, intervalMs);
    };
    log(`[heartbeat] started, interval: ${Math.round(intervalMs / 1000 / 60)}m`);
    scheduleNext();
    return {
        stop: () => {
            stopped = true;
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
            log(`[heartbeat] stopped`);
        },
        runOnce,
    };
}
export { HEARTBEAT_OK_TOKEN, DEFAULT_HEARTBEAT_PROMPT };
//# sourceMappingURL=runner.js.map