/**
 * 钩子执行器
 *
 * 提供钩子执行的核心逻辑，支持：
 * - 并行执行（fire-and-forget）
 * - 顺序执行（可修改返回值）
 * - 同步执行（tool_result_persist 专用）
 * - 优先级排序
 * - 错误处理选项
 */
import type { HookName, HookRegistry, HookAgentContext, HookMessageContext, HookToolContext, HookToolResultPersistContext, HookSessionContext, HookGatewayContext, BeforeAgentStartEvent, BeforeAgentStartResult, AgentEndEvent, BeforeCompactionEvent, AfterCompactionEvent, MessageReceivedEvent, MessageSendingEvent, MessageSendingResult, MessageSentEvent, BeforeToolCallEvent, BeforeToolCallResult, AfterToolCallEvent, ToolResultPersistEvent, ToolResultPersistResult, SessionStartEvent, SessionEndEvent, GatewayStartEvent, GatewayStopEvent } from "./hooks.js";
/**
 * 钩子运行器日志接口
 */
export interface HookRunnerLogger {
    debug?: (message: string) => void;
    warn?: (message: string) => void;
    error: (message: string) => void;
}
/**
 * 钩子运行器选项
 */
export interface HookRunnerOptions {
    /** 日志记录器 */
    logger?: HookRunnerLogger;
    /** 是否捕获错误（true: 记录错误但不抛出；false: 抛出错误） */
    catchErrors?: boolean;
}
/**
 * 创建钩子运行器
 *
 * @param registry 钩子注册表
 * @param options 运行器选项
 */
export declare function createHookRunner(registry: HookRegistry, options?: HookRunnerOptions): {
    runBeforeAgentStart: (event: BeforeAgentStartEvent, ctx: HookAgentContext) => Promise<BeforeAgentStartResult | undefined>;
    runAgentEnd: (event: AgentEndEvent, ctx: HookAgentContext) => Promise<void>;
    runBeforeCompaction: (event: BeforeCompactionEvent, ctx: HookAgentContext) => Promise<void>;
    runAfterCompaction: (event: AfterCompactionEvent, ctx: HookAgentContext) => Promise<void>;
    runMessageReceived: (event: MessageReceivedEvent, ctx: HookMessageContext) => Promise<void>;
    runMessageSending: (event: MessageSendingEvent, ctx: HookMessageContext) => Promise<MessageSendingResult | undefined>;
    runMessageSent: (event: MessageSentEvent, ctx: HookMessageContext) => Promise<void>;
    runBeforeToolCall: (event: BeforeToolCallEvent, ctx: HookToolContext) => Promise<BeforeToolCallResult | undefined>;
    runAfterToolCall: (event: AfterToolCallEvent, ctx: HookToolContext) => Promise<void>;
    runToolResultPersist: (event: ToolResultPersistEvent, ctx: HookToolResultPersistContext) => ToolResultPersistResult | undefined;
    runSessionStart: (event: SessionStartEvent, ctx: HookSessionContext) => Promise<void>;
    runSessionEnd: (event: SessionEndEvent, ctx: HookSessionContext) => Promise<void>;
    runGatewayStart: (event: GatewayStartEvent, ctx: HookGatewayContext) => Promise<void>;
    runGatewayStop: (event: GatewayStopEvent, ctx: HookGatewayContext) => Promise<void>;
    hasHooks: (hookName: HookName) => boolean;
    getHookCount: (hookName: HookName) => number;
};
/**
 * 钩子运行器类型
 */
export type HookRunner = ReturnType<typeof createHookRunner>;
//# sourceMappingURL=hook-runner.d.ts.map