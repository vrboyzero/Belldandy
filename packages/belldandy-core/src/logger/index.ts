/**
 * Belldandy Logger 模块
 *
 * 统一日志系统，支持：
 * - 双输出（控制台 + 文件）
 * - 按日期分文件、按大小轮转
 * - 自动清理过期日志
 * - Agent 可读（通过 log_read / log_search 工具）
 */

export {
  createLogger,
  createLoggerFromEnv,
  type BelldandyLogger,
  type ChildLogger,
} from "./logger.js";
export type { LogLevel, LogEntry, LogTransport, LoggerOptions } from "./types.js";
export { LOG_LEVEL_WEIGHT } from "./types.js";
export { parseSizeToBytes } from "./file-transport.js";
