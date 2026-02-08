/**
 * 工具增强型 Agent
 *
 * 支持工具调用的 Agent 实现，集成完整的钩子系统。
 */
import type { ToolExecutor } from "@belldandy/skills";
import type { AgentRunInput, AgentStreamItem, BelldandyAgent, AgentHooks } from "./index.js";
import type { HookRunner } from "./hook-runner.js";
export type ToolEnabledAgentOptions = {
    baseUrl: string;
    apiKey: string;
    model: string;
    toolExecutor: ToolExecutor;
    timeoutMs?: number;
    maxToolCalls?: number;
    systemPrompt?: string;
    /** 简化版钩子接口（向后兼容） */
    hooks?: AgentHooks;
    /** 新版钩子运行器（推荐使用） */
    hookRunner?: HookRunner;
    /** 可选：统一 Logger，用于钩子失败等日志 */
    logger?: {
        error(module: string, msg: string, data?: unknown): void;
    };
};
export declare class ToolEnabledAgent implements BelldandyAgent {
    private readonly opts;
    constructor(opts: ToolEnabledAgentOptions);
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
    private callModel;
}
//# sourceMappingURL=tool-agent.d.ts.map