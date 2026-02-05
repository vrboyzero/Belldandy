import type { JsonObject } from "@belldandy/protocol";
export type { JsonObject };
/** 工具参数 schema（JSON Schema 子集，兼容 OpenAI function calling） */
export type ToolParameterSchema = {
    type: "object";
    properties: Record<string, {
        type: "string" | "number" | "boolean" | "array" | "object";
        description: string;
        enum?: string[];
        items?: {
            type: string;
        };
    }>;
    required?: string[];
    oneOf?: Array<{
        required: string[];
    }>;
};
/** 工具定义（用于发送给模型） */
export type ToolDefinition = {
    name: string;
    description: string;
    parameters: ToolParameterSchema;
};
/** 工具调用请求 */
export type ToolCallRequest = {
    id: string;
    name: string;
    arguments: JsonObject;
};
/** 工具调用结果 */
export type ToolCallResult = {
    id: string;
    name: string;
    success: boolean;
    output: string;
    error?: string;
    durationMs: number;
};
/** 权限策略 */
export type ToolPolicy = {
    /** 文件读取允许路径（空 = 不限制，仅检查工作区边界） */
    allowedPaths: string[];
    /** 文件操作禁止路径 */
    deniedPaths: string[];
    /** 网络访问允许域名（空 = 允许所有公网域名） */
    allowedDomains: string[];
    /** 网络访问禁止域名 */
    deniedDomains: string[];
    /** 最大超时（毫秒） */
    maxTimeoutMs: number;
    /** 最大响应大小（字节） */
    maxResponseBytes: number;
};
export type SubAgentResult = {
    success: boolean;
    output: string;
    error?: string;
};
export type SessionInfo = {
    id: string;
    parentId?: string;
    status: "running" | "done" | "error";
    createdAt: number;
    summary?: string;
};
export type AgentCapabilities = {
    spawnSubAgent?: (instruction: string, context?: JsonObject) => Promise<SubAgentResult>;
    listSessions?: () => Promise<SessionInfo[]>;
};
/** 工具执行上下文 */
export type ToolContext = {
    conversationId: string;
    workspaceRoot: string;
    policy: ToolPolicy;
    agentCapabilities?: AgentCapabilities;
    logger?: {
        info(message: string): void;
        warn(message: string): void;
        error(message: string): void;
        debug(message: string): void;
        trace(message: string): void;
    };
};
/** 工具实现接口 */
export interface Tool {
    definition: ToolDefinition;
    execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult>;
}
/** 工具审计日志 */
export type ToolAuditLog = {
    timestamp: string;
    conversationId: string;
    toolName: string;
    arguments: JsonObject;
    success: boolean;
    output?: string;
    error?: string;
    durationMs: number;
};
//# sourceMappingURL=types.d.ts.map