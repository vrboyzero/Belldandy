/**
 * MCP 管理器
 *
 * 统一管理所有 MCP 服务器连接，提供工具发现、调用和资源访问等功能。
 * 这是 Belldandy 与 MCP 生态系统交互的主要入口点。
 */
import { MCPClient } from "./client.js";
import { MCPToolBridge, toOpenAIFunctions, toAnthropicTools } from "./tool-bridge.js";
import { loadConfig, createDefaultConfig, getAutoConnectServers, addServer, removeServer, updateServer, } from "./config.js";
import { mcpLog, mcpError } from "./logger-adapter.js";
// ============================================================================
// MCP 管理器实现
// ============================================================================
/**
 * MCP 管理器
 *
 * 统一管理多个 MCP 服务器连接和工具桥接。
 */
export class MCPManager {
    /** 配置 */
    config = null;
    /** 客户端映射: serverId -> MCPClient */
    clients = new Map();
    /** 工具桥接器 */
    toolBridge;
    /** 事件监听器 */
    eventListeners = new Set();
    /** 是否已初始化 */
    initialized = false;
    constructor() {
        // 创建工具桥接器，绑定工具调用函数
        this.toolBridge = new MCPToolBridge(this.handleToolCall.bind(this), true // 使用工具前缀
        );
    }
    // ==========================================================================
    // 初始化与关闭
    // ==========================================================================
    /**
     * 初始化 MCP 管理器
     *
     * 加载配置并自动连接标记为 autoConnect 的服务器。
     */
    async initialize() {
        if (this.initialized) {
            mcpLog("MCPManager", "已经初始化，跳过");
            return;
        }
        mcpLog("MCPManager", "正在初始化...");
        try {
            // 尝试创建默认配置（如果不存在）
            await createDefaultConfig();
            // 加载配置
            this.config = await loadConfig();
            // 获取自动连接的服务器
            const autoConnectServers = await getAutoConnectServers();
            // 并行连接所有自动连接的服务器
            if (autoConnectServers.length > 0) {
                mcpLog("MCPManager", `正在自动连接 ${autoConnectServers.length} 个服务器...`);
                const results = await Promise.allSettled(autoConnectServers.map((server) => this.connect(server.id)));
                // 统计结果
                const succeeded = results.filter((r) => r.status === "fulfilled").length;
                const failed = results.filter((r) => r.status === "rejected").length;
                mcpLog("MCPManager", `自动连接完成: ${succeeded} 成功, ${failed} 失败`);
            }
            this.initialized = true;
            mcpLog("MCPManager", "初始化完成");
        }
        catch (error) {
            mcpError("MCPManager", "初始化失败", error);
            throw error;
        }
    }
    /**
     * 关闭所有连接并清理资源
     */
    async shutdown() {
        mcpLog("MCPManager", "正在关闭...");
        // 断开所有客户端
        const disconnectPromises = Array.from(this.clients.keys()).map((serverId) => this.disconnect(serverId));
        await Promise.allSettled(disconnectPromises);
        // 清理资源
        this.clients.clear();
        this.toolBridge.unregisterAllTools();
        this.eventListeners.clear();
        this.initialized = false;
        mcpLog("MCPManager", "已关闭");
    }
    // ==========================================================================
    // 连接管理
    // ==========================================================================
    /**
     * 连接到指定的 MCP 服务器
     *
     * @param serverId 服务器 ID
     */
    async connect(serverId) {
        // 检查是否已连接
        if (this.clients.has(serverId)) {
            const client = this.clients.get(serverId);
            if (client.getState().status === "connected") {
                mcpLog("MCPManager", `服务器 ${serverId} 已连接，跳过`);
                return;
            }
        }
        // 获取服务器配置
        const serverConfig = this.config?.servers.find((s) => s.id === serverId);
        if (!serverConfig) {
            throw new Error(`服务器 "${serverId}" 不存在于配置中`);
        }
        if (serverConfig.enabled === false) {
            throw new Error(`服务器 "${serverId}" 已禁用`);
        }
        mcpLog("MCPManager", `正在连接到服务器: ${serverId}`);
        // 创建客户端
        const client = new MCPClient(serverConfig);
        // 添加事件监听
        client.addEventListener(this.handleClientEvent.bind(this));
        // 存储客户端
        this.clients.set(serverId, client);
        try {
            // 连接
            await client.connect();
            // 注册工具
            const state = client.getState();
            this.toolBridge.registerTools(state.tools);
            mcpLog("MCPManager", `已连接到服务器 ${serverId}，注册了 ${state.tools.length} 个工具`);
        }
        catch (error) {
            mcpError("MCPManager", `连接服务器 ${serverId} 失败`, error);
            throw error;
        }
    }
    /**
     * 断开指定服务器的连接
     *
     * @param serverId 服务器 ID
     */
    async disconnect(serverId) {
        const client = this.clients.get(serverId);
        if (!client) {
            mcpLog("MCPManager", `服务器 ${serverId} 未连接，跳过`);
            return;
        }
        mcpLog("MCPManager", `正在断开服务器: ${serverId}`);
        // 注销工具
        this.toolBridge.unregisterServerTools(serverId);
        // 断开连接
        await client.disconnect();
        // 移除客户端
        this.clients.delete(serverId);
        mcpLog("MCPManager", `已断开服务器: ${serverId}`);
    }
    /**
     * 重新连接指定服务器
     *
     * @param serverId 服务器 ID
     */
    async reconnect(serverId) {
        await this.disconnect(serverId);
        await this.connect(serverId);
    }
    // ==========================================================================
    // 状态查询
    // ==========================================================================
    /**
     * 获取指定服务器的状态
     *
     * @param serverId 服务器 ID
     * @returns 服务器状态，如果未连接则返回 undefined
     */
    getServerState(serverId) {
        const client = this.clients.get(serverId);
        return client?.getState();
    }
    /**
     * 获取所有服务器的状态
     *
     * @returns 所有服务器状态数组
     */
    getAllServerStates() {
        return Array.from(this.clients.values()).map((client) => client.getState());
    }
    /**
     * 获取所有可用的工具
     *
     * @returns MCP 工具信息数组
     */
    getAllTools() {
        return this.toolBridge.getAllTools();
    }
    /**
     * 获取所有可用的资源
     *
     * @returns MCP 资源信息数组
     */
    getAllResources() {
        const resources = [];
        for (const client of this.clients.values()) {
            const state = client.getState();
            resources.push(...state.resources);
        }
        return resources;
    }
    // ==========================================================================
    // 工具调用
    // ==========================================================================
    /**
     * 调用 MCP 工具
     *
     * @param request 工具调用请求
     * @returns 工具调用结果
     */
    async callTool(request) {
        return this.toolBridge.callTool(request.name, request.arguments);
    }
    /**
     * 获取 Belldandy 工具定义
     *
     * 用于将 MCP 工具集成到 Belldandy 的工具系统中。
     *
     * @returns Belldandy 工具定义数组
     */
    getBelldandyTools() {
        return this.toolBridge.toBelldandyTools();
    }
    /**
     * 获取 OpenAI Function 格式的工具定义
     *
     * 用于 OpenAI API 的 function calling。
     */
    getOpenAIFunctions() {
        return toOpenAIFunctions(this.getAllTools());
    }
    /**
     * 获取 Anthropic Tool 格式的工具定义
     *
     * 用于 Anthropic API 的 tool use。
     */
    getAnthropicTools() {
        return toAnthropicTools(this.getAllTools());
    }
    // ==========================================================================
    // 资源访问
    // ==========================================================================
    /**
     * 读取 MCP 资源
     *
     * @param request 资源读取请求
     * @returns 资源内容
     */
    async readResource(request) {
        // 查找拥有该资源的服务器
        for (const client of this.clients.values()) {
            const state = client.getState();
            const resource = state.resources.find((r) => r.uri === request.uri);
            if (resource) {
                return client.readResource(request.uri);
            }
        }
        throw new Error(`资源 "${request.uri}" 不存在`);
    }
    // ==========================================================================
    // 配置管理
    // ==========================================================================
    /**
     * 重新加载配置
     */
    async reloadConfig() {
        this.config = await loadConfig();
        mcpLog("MCPManager", "配置已重新加载");
    }
    /**
     * 添加服务器配置
     *
     * @param server 服务器配置
     */
    async addServer(server) {
        await addServer(server);
        await this.reloadConfig();
    }
    /**
     * 移除服务器配置
     *
     * @param serverId 服务器 ID
     */
    async removeServer(serverId) {
        // 如果已连接，先断开
        if (this.clients.has(serverId)) {
            await this.disconnect(serverId);
        }
        await removeServer(serverId);
        await this.reloadConfig();
    }
    /**
     * 更新服务器配置
     *
     * @param serverId 服务器 ID
     * @param updates 要更新的字段
     */
    async updateServer(serverId, updates) {
        await updateServer(serverId, updates);
        await this.reloadConfig();
    }
    /**
     * 获取当前配置
     */
    getConfig() {
        return this.config;
    }
    // ==========================================================================
    // 事件处理
    // ==========================================================================
    /**
     * 添加事件监听器
     */
    addEventListener(listener) {
        this.eventListeners.add(listener);
    }
    /**
     * 移除事件监听器
     */
    removeEventListener(listener) {
        this.eventListeners.delete(listener);
    }
    /**
     * 处理客户端事件
     */
    handleClientEvent(event) {
        // 转发给所有监听器
        for (const listener of this.eventListeners) {
            try {
                listener(event);
            }
            catch (err) {
                mcpError("MCPManager", "事件监听器错误", err);
            }
        }
        // 处理工具更新事件
        if (event.type === "tools:updated") {
            const client = this.clients.get(event.serverId);
            if (client) {
                // 重新注册工具
                this.toolBridge.unregisterServerTools(event.serverId);
                this.toolBridge.registerTools(client.getState().tools);
            }
        }
    }
    /**
     * 处理工具调用
     *
     * 由 MCPToolBridge 调用。
     */
    async handleToolCall(toolName, serverId, args) {
        const client = this.clients.get(serverId);
        if (!client) {
            return {
                success: false,
                error: `服务器 "${serverId}" 未连接`,
                isError: true,
            };
        }
        return client.callTool(toolName, args);
    }
    // ==========================================================================
    // 调试与诊断
    // ==========================================================================
    /**
     * 获取诊断信息
     */
    getDiagnostics() {
        const servers = Array.from(this.clients.entries()).map(([id, client]) => {
            const state = client.getState();
            return {
                id,
                name: client.serverName,
                status: state.status,
                toolCount: state.tools.length,
                resourceCount: state.resources.length,
            };
        });
        return {
            initialized: this.initialized,
            serverCount: this.clients.size,
            connectedCount: servers.filter((s) => s.status === "connected").length,
            toolCount: this.toolBridge.getToolCount(),
            resourceCount: this.getAllResources().length,
            servers,
        };
    }
    /**
     * 打印诊断信息
     */
    printDiagnostics() {
        const diag = this.getDiagnostics();
        mcpLog("MCPManager", `诊断: 初始化=${diag.initialized}, 服务器=${diag.serverCount}, 已连接=${diag.connectedCount}, 工具=${diag.toolCount}, 资源=${diag.resourceCount}`);
        if (diag.servers.length > 0) {
            for (const server of diag.servers) {
                mcpLog("MCPManager", `  - ${server.name} (${server.id}): ${server.status}, ${server.toolCount} 工具, ${server.resourceCount} 资源`);
            }
        }
    }
}
// ============================================================================
// 单例实例
// ============================================================================
/** 全局 MCP 管理器实例 */
let globalManager = null;
/**
 * 获取全局 MCP 管理器实例
 *
 * 如果实例不存在，则创建一个新实例。
 */
export function getMCPManager() {
    if (!globalManager) {
        globalManager = new MCPManager();
    }
    return globalManager;
}
/**
 * 初始化全局 MCP 管理器
 *
 * 便捷函数，用于初始化全局管理器实例。
 */
export async function initializeMCP() {
    const manager = getMCPManager();
    await manager.initialize();
    return manager;
}
/**
 * 关闭全局 MCP 管理器
 */
export async function shutdownMCP() {
    if (globalManager) {
        await globalManager.shutdown();
        globalManager = null;
    }
}
//# sourceMappingURL=manager.js.map