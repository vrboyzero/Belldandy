/**
 * MCP 管理器
 *
 * 统一管理所有 MCP 服务器连接，提供工具发现、调用和资源访问等功能。
 * 这是 Belldandy 与 MCP 生态系统交互的主要入口点。
 */
import { type MCPConfig, type MCPServerConfig, type MCPServerState, type MCPToolInfo, type MCPResourceInfo, type MCPToolCallRequest, type MCPToolCallResult, type MCPResourceReadRequest, type MCPResourceReadResult, type MCPEventListener, type MCPManager as IMCPManager, type BelldandyToolDefinition } from "./types.js";
import { toOpenAIFunctions, toAnthropicTools } from "./tool-bridge.js";
/**
 * MCP 管理器
 *
 * 统一管理多个 MCP 服务器连接和工具桥接。
 */
export declare class MCPManager implements IMCPManager {
    /** 配置 */
    private config;
    /** 客户端映射: serverId -> MCPClient */
    private clients;
    /** 工具桥接器 */
    private toolBridge;
    /** 事件监听器 */
    private eventListeners;
    /** 是否已初始化 */
    private initialized;
    constructor();
    /**
     * 初始化 MCP 管理器
     *
     * 加载配置并自动连接标记为 autoConnect 的服务器。
     */
    initialize(): Promise<void>;
    /**
     * 关闭所有连接并清理资源
     */
    shutdown(): Promise<void>;
    /**
     * 连接到指定的 MCP 服务器
     *
     * @param serverId 服务器 ID
     */
    connect(serverId: string): Promise<void>;
    /**
     * 断开指定服务器的连接
     *
     * @param serverId 服务器 ID
     */
    disconnect(serverId: string): Promise<void>;
    /**
     * 重新连接指定服务器
     *
     * @param serverId 服务器 ID
     */
    reconnect(serverId: string): Promise<void>;
    /**
     * 获取指定服务器的状态
     *
     * @param serverId 服务器 ID
     * @returns 服务器状态，如果未连接则返回 undefined
     */
    getServerState(serverId: string): MCPServerState | undefined;
    /**
     * 获取所有服务器的状态
     *
     * @returns 所有服务器状态数组
     */
    getAllServerStates(): MCPServerState[];
    /**
     * 获取所有可用的工具
     *
     * @returns MCP 工具信息数组
     */
    getAllTools(): MCPToolInfo[];
    /**
     * 获取所有可用的资源
     *
     * @returns MCP 资源信息数组
     */
    getAllResources(): MCPResourceInfo[];
    /**
     * 调用 MCP 工具
     *
     * @param request 工具调用请求
     * @returns 工具调用结果
     */
    callTool(request: MCPToolCallRequest): Promise<MCPToolCallResult>;
    /**
     * 获取 Belldandy 工具定义
     *
     * 用于将 MCP 工具集成到 Belldandy 的工具系统中。
     *
     * @returns Belldandy 工具定义数组
     */
    getBelldandyTools(): BelldandyToolDefinition[];
    /**
     * 获取 OpenAI Function 格式的工具定义
     *
     * 用于 OpenAI API 的 function calling。
     */
    getOpenAIFunctions(): ReturnType<typeof toOpenAIFunctions>;
    /**
     * 获取 Anthropic Tool 格式的工具定义
     *
     * 用于 Anthropic API 的 tool use。
     */
    getAnthropicTools(): ReturnType<typeof toAnthropicTools>;
    /**
     * 读取 MCP 资源
     *
     * @param request 资源读取请求
     * @returns 资源内容
     */
    readResource(request: MCPResourceReadRequest): Promise<MCPResourceReadResult>;
    /**
     * 重新加载配置
     */
    reloadConfig(): Promise<void>;
    /**
     * 添加服务器配置
     *
     * @param server 服务器配置
     */
    addServer(server: MCPServerConfig): Promise<void>;
    /**
     * 移除服务器配置
     *
     * @param serverId 服务器 ID
     */
    removeServer(serverId: string): Promise<void>;
    /**
     * 更新服务器配置
     *
     * @param serverId 服务器 ID
     * @param updates 要更新的字段
     */
    updateServer(serverId: string, updates: Partial<MCPServerConfig>): Promise<void>;
    /**
     * 获取当前配置
     */
    getConfig(): MCPConfig | null;
    /**
     * 添加事件监听器
     */
    addEventListener(listener: MCPEventListener): void;
    /**
     * 移除事件监听器
     */
    removeEventListener(listener: MCPEventListener): void;
    /**
     * 处理客户端事件
     */
    private handleClientEvent;
    /**
     * 处理工具调用
     *
     * 由 MCPToolBridge 调用。
     */
    private handleToolCall;
    /**
     * 获取诊断信息
     */
    getDiagnostics(): {
        initialized: boolean;
        serverCount: number;
        connectedCount: number;
        toolCount: number;
        resourceCount: number;
        servers: Array<{
            id: string;
            name: string;
            status: string;
            toolCount: number;
            resourceCount: number;
        }>;
    };
    /**
     * 打印诊断信息
     */
    printDiagnostics(): void;
}
/**
 * 获取全局 MCP 管理器实例
 *
 * 如果实例不存在，则创建一个新实例。
 */
export declare function getMCPManager(): MCPManager;
/**
 * 初始化全局 MCP 管理器
 *
 * 便捷函数，用于初始化全局管理器实例。
 */
export declare function initializeMCP(): Promise<MCPManager>;
/**
 * 关闭全局 MCP 管理器
 */
export declare function shutdownMCP(): Promise<void>;
//# sourceMappingURL=manager.d.ts.map