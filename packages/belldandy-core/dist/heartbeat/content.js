/**
 * Heartbeat 内容解析模块
 *
 * 解析 HEARTBEAT.md 文件内容，判断是否有效任务
 */
/**
 * 判断 HEARTBEAT.md 内容是否有效（有实际任务）
 *
 * 如果文件只包含空行、注释、标题，则视为"无效"（无需触发心跳）
 */
export function isHeartbeatContentEffectivelyEmpty(content) {
    const lines = content.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        // 空行
        if (!trimmed)
            continue;
        // Markdown 注释 <!-- ... -->
        if (trimmed.startsWith("<!--") && trimmed.endsWith("-->"))
            continue;
        // 标题（# 开头）
        if (trimmed.startsWith("#"))
            continue;
        // 单行注释（// 或 * 开头但后面只有空格）
        if (trimmed.startsWith("//"))
            continue;
        // 分隔线（---）
        if (/^-{3,}$/.test(trimmed))
            continue;
        // 有实际内容
        return false;
    }
    return true;
}
/**
 * HEARTBEAT_OK 响应检测
 *
 * 如果 Agent 回复包含 HEARTBEAT_OK，表示没有需要通知用户的事项
 */
export const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";
export function isHeartbeatOkResponse(text) {
    return text.includes(HEARTBEAT_OK_TOKEN);
}
/**
 * 清理心跳响应文本
 *
 * 移除 HEARTBEAT_OK token 和多余空白
 */
export function stripHeartbeatToken(text) {
    return text
        .replace(new RegExp(HEARTBEAT_OK_TOKEN, "g"), "")
        .trim();
}
/**
 * 默认心跳 prompt
 */
export const DEFAULT_HEARTBEAT_PROMPT = `Read HEARTBEAT.md if it exists. Follow it strictly.
Do not infer or repeat old tasks from prior chats.
If nothing needs attention, reply HEARTBEAT_OK.`;
//# sourceMappingURL=content.js.map