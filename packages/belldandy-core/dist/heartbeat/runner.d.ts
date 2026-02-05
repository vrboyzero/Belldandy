/**
 * Heartbeat Runner - 心跳定时任务系统
 *
 * 定期读取 HEARTBEAT.md 并触发 Agent 检查任务
 * 对标 Moltbot 实现：支持时区感知、状态持久化、消息去重、忙碌检测
 */
import { DEFAULT_HEARTBEAT_PROMPT, HEARTBEAT_OK_TOKEN } from "./content.js";
export interface HeartbeatRunnerOptions {
    /** 心跳间隔毫秒（默认 30 分钟） */
    intervalMs?: number;
    /** Workspace 目录（如 ~/.belldandy） */
    workspaceDir: string;
    /** 发送消息到 Agent 并获取回复 */
    sendMessage: (prompt: string) => Promise<string>;
    /** 推送消息到用户渠道（如飞书） */
    deliverToUser?: (message: string) => Promise<void>;
    /** 自定义心跳 prompt */
    prompt?: string;
    /** 活跃时段（如 "08:00-23:00"） */
    activeHours?: {
        start: string;
        end: string;
    };
    /** 用户时区（如 "Asia/Shanghai", "local", "user"） */
    timezone?: string;
    /** 系统是否忙碌（防止插队） */
    isBusy?: () => boolean;
    /** 日志函数 */
    log?: (message: string) => void;
}
export interface HeartbeatRunnerHandle {
    /** 停止心跳 */
    stop: () => void;
    /** 立即触发一次心跳（用于测试） */
    runOnce: () => Promise<HeartbeatResult>;
}
export interface HeartbeatResult {
    status: "ran" | "skipped" | "failed";
    reason?: string;
    durationMs?: number;
    message?: string;
}
export declare function startHeartbeatRunner(options: HeartbeatRunnerOptions): HeartbeatRunnerHandle;
export { HEARTBEAT_OK_TOKEN, DEFAULT_HEARTBEAT_PROMPT };
//# sourceMappingURL=runner.d.ts.map