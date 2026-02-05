/**
 * MCP 集成模块
 *
 * 提供 MCP 管理器的初始化和工具注册功能，
 * 将 MCP 工具桥接到 Belldandy 的工具系统中。
 */
import { initializeMCP, shutdownMCP, } from "@belldandy/mcp";
/** 全局集成状态 */
const state = {
    initialized: false,
    manager: null,
    toolCount: 0,
};
// ============================================================================
// MCP 工具转换
// ============================================================================
/**
 * 将 MCP 工具转换为 Belldandy Tool 接口
 *
 * @param mcpTool MCP 工具信息
 * @param callTool 工具调用函数
 * @returns Belldandy Tool 实现
 */
function mcpToolToTool(mcpTool, callTool) {
    return {
        definition: {
            name: mcpTool.bridgedName,
            description: mcpTool.description
                ? `${mcpTool.description}\n[来自 MCP 服务器: ${mcpTool.serverId}]`
                : `MCP 工具: ${mcpTool.name} [来自: ${mcpTool.serverId}]`,
            parameters: mcpTool.inputSchema,
        },
        execute: async (args, context) => {
            const start = Date.now();
            try {
                const result = await callTool(mcpTool.bridgedName, args);
                return {
                    id: "", // 由 ToolExecutor 设置
                    name: mcpTool.bridgedName,
                    success: true,
                    output: typeof result === "string" ? result : JSON.stringify(result, null, 2),
                    durationMs: Date.now() - start,
                };
            }
            catch (err) {
                return {
                    id: "",
                    name: mcpTool.bridgedName,
                    success: false,
                    output: "",
                    error: err instanceof Error ? err.message : String(err),
                    durationMs: Date.now() - start,
                };
            }
        },
    };
}
// ============================================================================
// MCP 集成函数
// ============================================================================
/**
 * 初始化 MCP 集成
 *
 * @returns MCP 管理器实例
 */
export async function initMCPIntegration() {
    if (state.initialized && state.manager) {
        console.log("[MCP Integration] 已经初始化，返回现有实例");
        return state.manager;
    }
    console.log("[MCP Integration] 正在初始化...");
    try {
        const manager = await initializeMCP();
        state.manager = manager;
        state.initialized = true;
        state.toolCount = manager.getAllTools().length;
        console.log(`[MCP Integration] 初始化完成，共 ${state.toolCount} 个 MCP 工具可用`);
        return manager;
    }
    catch (error) {
        console.error("[MCP Integration] 初始化失败:", error);
        throw error;
    }
}
/**
 * 关闭 MCP 集成
 */
export async function shutdownMCPIntegration() {
    if (!state.initialized) {
        return;
    }
    console.log("[MCP Integration] 正在关闭...");
    await shutdownMCP();
    state.manager = null;
    state.initialized = false;
    state.toolCount = 0;
    console.log("[MCP Integration] 已关闭");
}
/**
 * 获取 MCP 管理器（如果已初始化）
 */
export function getMCPManagerIfInitialized() {
    return state.manager;
}
/**
 * 检查 MCP 是否已初始化
 */
export function isMCPInitialized() {
    return state.initialized;
}
/**
 * 获取所有 MCP 工具
 *
 * 将 MCP 工具转换为可以注册到 ToolExecutor 的 Tool 实例。
 *
 * @returns Tool 实例数组
 */
export function getMCPTools() {
    if (!state.manager) {
        return [];
    }
    const mcpTools = state.manager.getAllTools();
    return mcpTools.map((tool) => mcpToolToTool(tool, async (name, args) => {
        const result = await state.manager.callTool({
            name,
            arguments: args,
        });
        if (result.isError) {
            throw new Error(result.error || "MCP 工具调用失败");
        }
        // 提取结果内容
        if (!result.content || result.content.length === 0) {
            return null;
        }
        // 单个文本结果
        if (result.content.length === 1 &&
            result.content[0].type === "text" &&
            result.content[0].text) {
            // 尝试解析 JSON
            try {
                return JSON.parse(result.content[0].text);
            }
            catch {
                return result.content[0].text;
            }
        }
        // 多个结果或复杂类型
        return result.content;
    }));
}
/**
 * 将 MCP 工具注册到 ToolExecutor
 *
 * @param executor 工具执行器
 * @returns 注册的工具数量
 */
export function registerMCPToolsToExecutor(executor) {
    const tools = getMCPTools();
    if (tools.length === 0) {
        console.log("[MCP Integration] 没有 MCP 工具可注册");
        return 0;
    }
    // 注册每个工具
    for (const tool of tools) {
        executor.registerTool(tool);
    }
    console.log(`[MCP Integration] 已注册 ${tools.length} 个 MCP 工具到 ToolExecutor`);
    return tools.length;
}
/**
 * 获取 MCP 诊断信息
 */
export function getMCPDiagnostics() {
    if (!state.manager) {
        return null;
    }
    const diag = state.manager.getDiagnostics();
    return {
        initialized: diag.initialized,
        toolCount: diag.toolCount,
        serverCount: diag.serverCount,
        connectedCount: diag.connectedCount,
        servers: diag.servers.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            toolCount: s.toolCount,
        })),
    };
}
/**
 * 打印 MCP 状态
 */
export function printMCPStatus() {
    const diag = getMCPDiagnostics();
    if (!diag) {
        console.log("[MCP] 未初始化");
        return;
    }
    console.log(`[MCP] 状态: ${diag.initialized ? "已初始化" : "未初始化"}`);
    console.log(`[MCP] 服务器: ${diag.connectedCount}/${diag.serverCount} 已连接`);
    console.log(`[MCP] 工具: ${diag.toolCount} 个可用`);
    if (diag.servers.length > 0) {
        for (const server of diag.servers) {
            console.log(`  - ${server.name} (${server.id}): ${server.status}, ${server.toolCount} 工具`);
        }
    }
}
//# sourceMappingURL=index.js.map