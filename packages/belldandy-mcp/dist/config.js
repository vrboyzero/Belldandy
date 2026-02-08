/**
 * MCP 配置加载与管理
 *
 * 负责从 ~/.belldandy/mcp.json 加载和验证 MCP 服务器配置。
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { mcpLog } from "./logger-adapter.js";
import { z } from "zod";
import { DEFAULT_MCP_CONFIG, DEFAULT_SERVER_CONFIG, } from "./types.js";
// ============================================================================
// 配置路径常量
// ============================================================================
/** Belldandy 用户目录 */
const BELLDANDY_DIR = join(homedir(), ".belldandy");
/** MCP 配置文件路径 */
const MCP_CONFIG_PATH = join(BELLDANDY_DIR, "mcp.json");
// ============================================================================
// Zod 验证 Schema
// ============================================================================
/**
 * stdio 传输配置验证
 */
const StdioConfigSchema = z.object({
    type: z.literal("stdio"),
    command: z.string().min(1, "命令不能为空"),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
});
/**
 * SSE 传输配置验证
 */
const SSEConfigSchema = z.object({
    type: z.literal("sse"),
    url: z.string().url("必须是有效的 URL"),
    headers: z.record(z.string()).optional(),
});
/**
 * 传输配置验证（联合类型）
 */
const TransportConfigSchema = z.discriminatedUnion("type", [
    StdioConfigSchema,
    SSEConfigSchema,
]);
/**
 * 单个服务器配置验证
 */
const ServerConfigSchema = z.object({
    id: z.string().min(1, "服务器 ID 不能为空"),
    name: z.string().min(1, "服务器名称不能为空"),
    description: z.string().optional(),
    transport: TransportConfigSchema,
    autoConnect: z.boolean().optional().default(DEFAULT_SERVER_CONFIG.autoConnect),
    enabled: z.boolean().optional().default(DEFAULT_SERVER_CONFIG.enabled),
    timeout: z.number().positive().optional().default(DEFAULT_SERVER_CONFIG.timeout),
    retryCount: z.number().int().min(0).optional().default(DEFAULT_SERVER_CONFIG.retryCount),
    retryDelay: z.number().positive().optional().default(DEFAULT_SERVER_CONFIG.retryDelay),
});
/**
 * 全局设置验证
 */
const SettingsSchema = z.object({
    defaultTimeout: z.number().positive().optional().default(30000),
    debug: z.boolean().optional().default(false),
    toolPrefix: z.boolean().optional().default(true),
});
/**
 * 完整配置验证
 */
const MCPConfigSchema = z.object({
    version: z.string().optional().default("1.0.0"),
    servers: z.array(ServerConfigSchema).default([]),
    settings: SettingsSchema.optional(),
});
// ============================================================================
// 配置加载函数
// ============================================================================
/**
 * 检查配置文件是否存在
 */
export async function configExists() {
    try {
        await access(MCP_CONFIG_PATH);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 加载 MCP 配置
 *
 * @returns 解析后的 MCP 配置
 * @throws 如果配置文件无效或不存在
 */
export async function loadConfig() {
    // 检查配置文件是否存在
    if (!(await configExists())) {
        mcpLog("MCP", `配置文件不存在: ${MCP_CONFIG_PATH}`);
        mcpLog("MCP", "使用默认配置（无服务器）");
        return { ...DEFAULT_MCP_CONFIG };
    }
    try {
        // 读取配置文件
        const content = await readFile(MCP_CONFIG_PATH, "utf-8");
        const rawConfig = JSON.parse(content);
        // 验证配置
        const result = MCPConfigSchema.safeParse(rawConfig);
        if (!result.success) {
            const errors = result.error.errors
                .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
                .join("\n");
            throw new Error(`MCP 配置验证失败:\n${errors}`);
        }
        // 验证服务器 ID 唯一性
        const serverIds = new Set();
        for (const server of result.data.servers) {
            if (serverIds.has(server.id)) {
                throw new Error(`MCP 配置错误: 服务器 ID "${server.id}" 重复`);
            }
            serverIds.add(server.id);
        }
        mcpLog("MCP", `已加载配置，共 ${result.data.servers.length} 个服务器`);
        return result.data;
    }
    catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`MCP 配置文件 JSON 格式错误: ${error.message}`);
        }
        throw error;
    }
}
/**
 * 保存 MCP 配置
 *
 * @param config 要保存的配置
 */
export async function saveConfig(config) {
    // 确保目录存在
    try {
        await access(BELLDANDY_DIR);
    }
    catch {
        await mkdir(BELLDANDY_DIR, { recursive: true });
    }
    // 验证配置
    const result = MCPConfigSchema.safeParse(config);
    if (!result.success) {
        const errors = result.error.errors
            .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
            .join("\n");
        throw new Error(`无效的 MCP 配置:\n${errors}`);
    }
    // 写入配置文件
    const content = JSON.stringify(config, null, 2);
    await writeFile(MCP_CONFIG_PATH, content, "utf-8");
    mcpLog("MCP", `配置已保存到: ${MCP_CONFIG_PATH}`);
}
/**
 * 创建默认配置文件
 *
 * 如果配置文件不存在，则创建一个包含示例服务器的默认配置。
 */
export async function createDefaultConfig() {
    if (await configExists()) {
        mcpLog("MCP", `配置文件已存在: ${MCP_CONFIG_PATH}`);
        return;
    }
    const defaultConfig = {
        version: "1.0.0",
        servers: [
            {
                id: "example-filesystem",
                name: "文件系统服务器 (示例)",
                description: "示例：提供文件系统访问能力的 MCP 服务器",
                transport: {
                    type: "stdio",
                    command: "npx",
                    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
                },
                autoConnect: false,
                enabled: false,
            },
        ],
        settings: {
            defaultTimeout: 30000,
            debug: false,
            toolPrefix: true,
        },
    };
    await saveConfig(defaultConfig);
    mcpLog("MCP", `已创建默认配置文件: ${MCP_CONFIG_PATH}`);
}
// ============================================================================
// 配置操作函数
// ============================================================================
/**
 * 添加服务器配置
 *
 * @param server 服务器配置
 */
export async function addServer(server) {
    const config = await loadConfig();
    // 检查 ID 是否已存在
    if (config.servers.some((s) => s.id === server.id)) {
        throw new Error(`服务器 ID "${server.id}" 已存在`);
    }
    // 验证服务器配置
    const result = ServerConfigSchema.safeParse(server);
    if (!result.success) {
        const errors = result.error.errors
            .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
            .join("\n");
        throw new Error(`无效的服务器配置:\n${errors}`);
    }
    config.servers.push(result.data);
    await saveConfig(config);
}
/**
 * 移除服务器配置
 *
 * @param serverId 服务器 ID
 */
export async function removeServer(serverId) {
    const config = await loadConfig();
    const index = config.servers.findIndex((s) => s.id === serverId);
    if (index === -1) {
        throw new Error(`服务器 "${serverId}" 不存在`);
    }
    config.servers.splice(index, 1);
    await saveConfig(config);
}
/**
 * 更新服务器配置
 *
 * @param serverId 服务器 ID
 * @param updates 要更新的字段
 */
export async function updateServer(serverId, updates) {
    const config = await loadConfig();
    const server = config.servers.find((s) => s.id === serverId);
    if (!server) {
        throw new Error(`服务器 "${serverId}" 不存在`);
    }
    // 不允许更改 ID
    if (updates.id && updates.id !== serverId) {
        throw new Error("不允许更改服务器 ID");
    }
    // 合并更新
    Object.assign(server, updates);
    // 验证更新后的配置
    const result = ServerConfigSchema.safeParse(server);
    if (!result.success) {
        const errors = result.error.errors
            .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
            .join("\n");
        throw new Error(`更新后的配置无效:\n${errors}`);
    }
    await saveConfig(config);
}
/**
 * 获取服务器配置
 *
 * @param serverId 服务器 ID
 * @returns 服务器配置，如果不存在则返回 undefined
 */
export async function getServer(serverId) {
    const config = await loadConfig();
    return config.servers.find((s) => s.id === serverId);
}
/**
 * 获取所有启用的服务器配置
 *
 * @returns 启用的服务器配置列表
 */
export async function getEnabledServers() {
    const config = await loadConfig();
    return config.servers.filter((s) => s.enabled !== false);
}
/**
 * 获取所有自动连接的服务器配置
 *
 * @returns 自动连接的服务器配置列表
 */
export async function getAutoConnectServers() {
    const config = await loadConfig();
    return config.servers.filter((s) => s.enabled !== false && s.autoConnect !== false);
}
// ============================================================================
// 导出配置路径
// ============================================================================
export { BELLDANDY_DIR, MCP_CONFIG_PATH };
//# sourceMappingURL=config.js.map