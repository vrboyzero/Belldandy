/**
 * Belldandy MCP 类型定义
 *
 * MCP (Model Context Protocol) 是一个标准化协议，用于 AI 助手连接外部数据源和工具。
 * 本模块定义了 Belldandy 与 MCP 服务器交互所需的所有类型。
 */
// ============================================================================
// 类型守卫
// ============================================================================
/**
 * 检查传输配置是否为 stdio 类型
 */
export function isStdioTransport(transport) {
    return transport.type === "stdio";
}
/**
 * 检查传输配置是否为 SSE 类型
 */
export function isSSETransport(transport) {
    return transport.type === "sse";
}
// ============================================================================
// 默认值
// ============================================================================
/**
 * 默认 MCP 配置
 */
export const DEFAULT_MCP_CONFIG = {
    version: "1.0.0",
    servers: [],
    settings: {
        defaultTimeout: 30000,
        debug: false,
        toolPrefix: true,
    },
};
/**
 * 默认服务器配置值
 */
export const DEFAULT_SERVER_CONFIG = {
    autoConnect: true,
    enabled: true,
    timeout: 30000,
    retryCount: 3,
    retryDelay: 1000,
};
//# sourceMappingURL=types.js.map