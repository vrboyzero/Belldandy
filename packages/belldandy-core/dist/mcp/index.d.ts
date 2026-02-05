/**
 * MCP 集成模块
 *
 * 提供 MCP 管理器的初始化和工具注册功能，
 * 将 MCP 工具桥接到 Belldandy 的工具系统中。
 */
import { type MCPManager } from "@belldandy/mcp";
import type { ToolExecutor, Tool } from "@belldandy/skills";
/**
 * 初始化 MCP 集成
 *
 * @returns MCP 管理器实例
 */
export declare function initMCPIntegration(): Promise<MCPManager>;
/**
 * 关闭 MCP 集成
 */
export declare function shutdownMCPIntegration(): Promise<void>;
/**
 * 获取 MCP 管理器（如果已初始化）
 */
export declare function getMCPManagerIfInitialized(): MCPManager | null;
/**
 * 检查 MCP 是否已初始化
 */
export declare function isMCPInitialized(): boolean;
/**
 * 获取所有 MCP 工具
 *
 * 将 MCP 工具转换为可以注册到 ToolExecutor 的 Tool 实例。
 *
 * @returns Tool 实例数组
 */
export declare function getMCPTools(): Tool[];
/**
 * 将 MCP 工具注册到 ToolExecutor
 *
 * @param executor 工具执行器
 * @returns 注册的工具数量
 */
export declare function registerMCPToolsToExecutor(executor: ToolExecutor): number;
/**
 * 获取 MCP 诊断信息
 */
export declare function getMCPDiagnostics(): {
    initialized: boolean;
    toolCount: number;
    serverCount: number;
    connectedCount: number;
    servers: Array<{
        id: string;
        name: string;
        status: string;
        toolCount: number;
    }>;
} | null;
/**
 * 打印 MCP 状态
 */
export declare function printMCPStatus(): void;
export type { MCPManager };
//# sourceMappingURL=index.d.ts.map