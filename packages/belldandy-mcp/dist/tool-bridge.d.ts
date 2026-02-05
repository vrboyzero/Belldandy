/**
 * MCP 工具桥接器
 *
 * 将 MCP 服务器提供的工具桥接到 Belldandy 的工具系统中，
 * 使 Agent 能够调用外部 MCP 工具。
 */
import type { MCPToolInfo, MCPToolCallResult, BelldandyToolDefinition } from "./types.js";
/**
 * 工具调用函数类型
 */
type ToolCallFn = (toolName: string, serverId: string, args: Record<string, unknown>) => Promise<MCPToolCallResult>;
/**
 * MCP 工具桥接器
 *
 * 负责将 MCP 工具转换为 Belldandy 可用的工具定义。
 */
export declare class MCPToolBridge {
    /** 工具调用函数 */
    private callToolFn;
    /** 是否使用工具前缀 */
    private usePrefix;
    /** 已桥接的工具映射: bridgedName -> MCPToolInfo */
    private bridgedTools;
    constructor(callToolFn: ToolCallFn, usePrefix?: boolean);
    /**
     * 注册 MCP 工具
     *
     * @param tools MCP 工具列表
     */
    registerTools(tools: MCPToolInfo[]): void;
    /**
     * 注销服务器的所有工具
     *
     * @param serverId 服务器 ID
     */
    unregisterServerTools(serverId: string): void;
    /**
     * 注销所有工具
     */
    unregisterAllTools(): void;
    /**
     * 获取已桥接的工具数量
     */
    getToolCount(): number;
    /**
     * 检查工具是否存在
     *
     * @param bridgedName 桥接后的工具名称
     */
    hasTool(bridgedName: string): boolean;
    /**
     * 获取工具信息
     *
     * @param bridgedName 桥接后的工具名称
     */
    getToolInfo(bridgedName: string): MCPToolInfo | undefined;
    /**
     * 获取所有已桥接的工具信息
     */
    getAllTools(): MCPToolInfo[];
    /**
     * 将所有已桥接的工具转换为 Belldandy 工具定义
     *
     * @returns Belldandy 工具定义数组
     */
    toBelldandyTools(): BelldandyToolDefinition[];
    /**
     * 获取指定服务器的工具定义
     *
     * @param serverId 服务器 ID
     * @returns Belldandy 工具定义数组
     */
    getServerTools(serverId: string): BelldandyToolDefinition[];
    /**
     * 调用工具
     *
     * @param bridgedName 桥接后的工具名称
     * @param args 工具参数
     * @returns 工具调用结果
     */
    callTool(bridgedName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
    /**
     * 创建 Belldandy 工具定义
     */
    private createBelldandyTool;
    /**
     * 规范化输入 Schema
     */
    private normalizeInputSchema;
    /**
     * 构建工具描述
     */
    private buildDescription;
    /**
     * 格式化工具结果
     */
    private formatResult;
}
/**
 * 生成工具调用的 OpenAI Function 格式
 *
 * 用于将 MCP 工具转换为 OpenAI API 的 function calling 格式。
 *
 * @param tool MCP 工具信息
 * @returns OpenAI Function 定义
 */
export declare function toOpenAIFunction(tool: MCPToolInfo): {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
};
/**
 * 生成工具调用的 Anthropic Tool 格式
 *
 * 用于将 MCP 工具转换为 Anthropic API 的 tool use 格式。
 *
 * @param tool MCP 工具信息
 * @returns Anthropic Tool 定义
 */
export declare function toAnthropicTool(tool: MCPToolInfo): {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
};
/**
 * 批量转换工具为 OpenAI 格式
 */
export declare function toOpenAIFunctions(tools: MCPToolInfo[]): ReturnType<typeof toOpenAIFunction>[];
/**
 * 批量转换工具为 Anthropic 格式
 */
export declare function toAnthropicTools(tools: MCPToolInfo[]): ReturnType<typeof toAnthropicTool>[];
export {};
//# sourceMappingURL=tool-bridge.d.ts.map