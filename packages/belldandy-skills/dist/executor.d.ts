import type { Tool, ToolCallRequest, ToolCallResult, ToolPolicy, ToolAuditLog, AgentCapabilities } from "./types.js";
/** 默认策略（最小权限） */
export declare const DEFAULT_POLICY: ToolPolicy;
export type ToolExecutorOptions = {
    tools: Tool[];
    workspaceRoot: string;
    policy?: Partial<ToolPolicy>;
    auditLogger?: (log: ToolAuditLog) => void;
    agentCapabilities?: AgentCapabilities;
};
export declare class ToolExecutor {
    private readonly tools;
    private readonly workspaceRoot;
    private readonly policy;
    private readonly auditLogger?;
    private readonly agentCapabilities?;
    constructor(options: ToolExecutorOptions);
    /** 获取所有工具定义（用于发送给模型） */
    getDefinitions(): {
        type: "function";
        function: {
            name: string;
            description: string;
            parameters: object;
        };
    }[];
    /** 检查工具是否存在 */
    hasTool(name: string): boolean;
    /** 动态注册工具 */
    registerTool(tool: Tool): void;
    /** 动态注销工具 */
    unregisterTool(name: string): boolean;
    /** 获取已注册的工具数量 */
    getToolCount(): number;
    /** 执行工具调用 */
    execute(request: ToolCallRequest, conversationId: string): Promise<ToolCallResult>;
    /** 批量执行（并行） */
    executeAll(requests: ToolCallRequest[], conversationId: string): Promise<ToolCallResult[]>;
    private audit;
}
//# sourceMappingURL=executor.d.ts.map