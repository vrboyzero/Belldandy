/**
 * MCP 配置加载与管理
 *
 * 负责从 ~/.belldandy/mcp.json 加载和验证 MCP 服务器配置。
 */
import { type MCPConfig, type MCPServerConfig } from "./types.js";
/** Belldandy 用户目录 */
declare const BELLDANDY_DIR: string;
/** MCP 配置文件路径 */
declare const MCP_CONFIG_PATH: string;
/**
 * 检查配置文件是否存在
 */
export declare function configExists(): Promise<boolean>;
/**
 * 加载 MCP 配置
 *
 * @returns 解析后的 MCP 配置
 * @throws 如果配置文件无效或不存在
 */
export declare function loadConfig(): Promise<MCPConfig>;
/**
 * 保存 MCP 配置
 *
 * @param config 要保存的配置
 */
export declare function saveConfig(config: MCPConfig): Promise<void>;
/**
 * 创建默认配置文件
 *
 * 如果配置文件不存在，则创建一个包含示例服务器的默认配置。
 */
export declare function createDefaultConfig(): Promise<void>;
/**
 * 添加服务器配置
 *
 * @param server 服务器配置
 */
export declare function addServer(server: MCPServerConfig): Promise<void>;
/**
 * 移除服务器配置
 *
 * @param serverId 服务器 ID
 */
export declare function removeServer(serverId: string): Promise<void>;
/**
 * 更新服务器配置
 *
 * @param serverId 服务器 ID
 * @param updates 要更新的字段
 */
export declare function updateServer(serverId: string, updates: Partial<MCPServerConfig>): Promise<void>;
/**
 * 获取服务器配置
 *
 * @param serverId 服务器 ID
 * @returns 服务器配置，如果不存在则返回 undefined
 */
export declare function getServer(serverId: string): Promise<MCPServerConfig | undefined>;
/**
 * 获取所有启用的服务器配置
 *
 * @returns 启用的服务器配置列表
 */
export declare function getEnabledServers(): Promise<MCPServerConfig[]>;
/**
 * 获取所有自动连接的服务器配置
 *
 * @returns 自动连接的服务器配置列表
 */
export declare function getAutoConnectServers(): Promise<MCPServerConfig[]>;
export { BELLDANDY_DIR, MCP_CONFIG_PATH };
//# sourceMappingURL=config.d.ts.map