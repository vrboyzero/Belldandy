/**
 * MCP 客户端封装
 *
 * 对 @modelcontextprotocol/sdk 的 Client 进行封装，
 * 提供连接管理、工具发现和调用等功能。
 */
import { type MCPServerConfig, type MCPServerState, type MCPToolCallResult, type MCPResourceReadResult, type MCPEventListener } from "./types.js";
/**
 * MCP 客户端
 *
 * 封装单个 MCP 服务器的连接和交互。
 */
export declare class MCPClient {
    /** 服务器配置 */
    private config;
    /** MCP SDK 客户端实例 */
    private client;
    /** 传输层实例 */
    private transport;
    /** 子进程实例（仅 stdio 传输） */
    private childProcess;
    /** 当前状态 */
    private status;
    /** 错误信息 */
    private error;
    /** 连接时间 */
    private connectedAt;
    /** 缓存的工具列表 */
    private tools;
    /** 缓存的资源列表 */
    private resources;
    /** 服务器元数据 */
    private metadata;
    /** 事件监听器 */
    private eventListeners;
    /** 重连计数器 */
    private reconnectCount;
    constructor(config: MCPServerConfig);
    /**
     * 获取服务器 ID
     */
    get serverId(): string;
    /**
     * 获取服务器名称
     */
    get serverName(): string;
    /**
     * 获取当前状态
     */
    getState(): MCPServerState;
    /**
     * 连接到 MCP 服务器
     */
    connect(): Promise<void>;
    /**
     * 断开连接
     */
    disconnect(): Promise<void>;
    /**
     * 重新连接
     */
    reconnect(): Promise<void>;
    /**
     * 调用工具
     *
     * @param toolName 工具名称（原始名称，非桥接名称）
     * @param args 工具参数
     * @returns 工具调用结果
     */
    callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult>;
    /**
     * 读取资源
     *
     * @param uri 资源 URI
     * @returns 资源内容
     */
    readResource(uri: string): Promise<MCPResourceReadResult>;
    /**
     * 刷新工具和资源列表
     */
    refresh(): Promise<void>;
    /**
     * 添加事件监听器
     */
    addEventListener(listener: MCPEventListener): void;
    /**
     * 移除事件监听器
     */
    removeEventListener(listener: MCPEventListener): void;
    /**
     * 创建传输层
     */
    private createTransport;
    /**
     * 创建 stdio 传输层
     */
    private createStdioTransport;
    /**
     * 创建 SSE 传输层
     */
    private createSSETransport;
    /**
     * 发现服务器能力（工具和资源）
     */
    private discoverCapabilities;
    /**
     * 获取桥接后的工具名称
     *
     * 格式: mcp_{serverId}_{toolName}
     */
    private getBridgedToolName;
    /**
     * 清理资源
     */
    private cleanup;
    /**
     * 设置状态并触发事件
     */
    private setStatus;
    /**
     * 触发事件
     */
    private emitEvent;
}
//# sourceMappingURL=client.d.ts.map