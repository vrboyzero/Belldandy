/**
 * @belldandy/mcp - MCP (Model Context Protocol) 支持模块
 *
 * 本模块为 Belldandy 提供 MCP 协议支持，使 Agent 能够：
 * - 连接外部 MCP 服务器
 * - 发现和调用 MCP 工具
 * - 访问 MCP 资源
 *
 * @example
 * ```typescript
 * import { initializeMCP, getMCPManager } from "@belldandy/mcp";
 *
 * // 初始化 MCP 管理器
 * await initializeMCP();
 *
 * // 获取管理器实例
 * const manager = getMCPManager();
 *
 * // 获取所有可用工具
 * const tools = manager.getAllTools();
 *
 * // 调用工具
 * const result = await manager.callTool({
 *   name: "mcp_filesystem_read_file",
 *   arguments: { path: "/tmp/test.txt" }
 * });
 * ```
 */
export type { MCPTransportType, MCPStdioConfig, MCPSSEConfig, MCPServerConfig, MCPConfig, MCPServerStatus, MCPServerState, MCPToolInfo, MCPResourceInfo, MCPToolCallRequest, MCPToolCallResult, MCPResourceReadRequest, MCPResourceReadResult, MCPEventType, MCPEvent, MCPEventListener, MCPManager as IMCPManager, BelldandyToolDefinition, } from "./types.js";
export { isStdioTransport, isSSETransport, DEFAULT_MCP_CONFIG, DEFAULT_SERVER_CONFIG, } from "./types.js";
export { setMCPLogger } from "./logger-adapter.js";
export { loadConfig, saveConfig, createDefaultConfig, configExists, addServer, removeServer, updateServer, getServer, getEnabledServers, getAutoConnectServers, BELLDANDY_DIR, MCP_CONFIG_PATH, } from "./config.js";
export { MCPClient } from "./client.js";
export { MCPToolBridge, toOpenAIFunction, toAnthropicTool, toOpenAIFunctions, toAnthropicTools, } from "./tool-bridge.js";
export { MCPManager, getMCPManager, initializeMCP, shutdownMCP, } from "./manager.js";
//# sourceMappingURL=index.d.ts.map