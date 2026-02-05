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
export declare function isHeartbeatContentEffectivelyEmpty(content: string): boolean;
/**
 * HEARTBEAT_OK 响应检测
 *
 * 如果 Agent 回复包含 HEARTBEAT_OK，表示没有需要通知用户的事项
 */
export declare const HEARTBEAT_OK_TOKEN = "HEARTBEAT_OK";
export declare function isHeartbeatOkResponse(text: string): boolean;
/**
 * 清理心跳响应文本
 *
 * 移除 HEARTBEAT_OK token 和多余空白
 */
export declare function stripHeartbeatToken(text: string): string;
/**
 * 默认心跳 prompt
 */
export declare const DEFAULT_HEARTBEAT_PROMPT = "Read HEARTBEAT.md if it exists. Follow it strictly.\nDo not infer or repeat old tasks from prior chats.\nIf nothing needs attention, reply HEARTBEAT_OK.";
//# sourceMappingURL=content.d.ts.map