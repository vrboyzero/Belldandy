/**
 * Belldandy Logger - 类型定义
 *
 * 支持 debug/info/warn/error 四个级别，双输出（控制台+文件），
 * 按日期分文件、按大小轮转、自动清理过期日志。
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** 日志级别权重，用于比较 */
export const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** 单条日志记录 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  module: string;
  message: string;
  /** 可选的附加数据，会序列化为 JSON 追加到消息后 */
  data?: unknown;
}

/** Transport 接口：输出日志到某个目标 */
export interface LogTransport {
  write(entry: LogEntry, formatted: string): void;
  /** 关闭/清理资源（如关闭文件句柄） */
  close?(): void | Promise<void>;
}

/** Logger 配置 */
export interface LoggerOptions {
  /** 最低输出级别，低于此级别的日志将被过滤 */
  level?: LogLevel;
  /** 日志目录（用于文件输出） */
  dir?: string;
  /** 单文件最大大小（字节），超过后轮转 */
  maxFileSize?: number;
  /** 日志保留天数，超过的会被清理 */
  maxRetentionDays?: number;
  /** 是否启用控制台输出 */
  enableConsole?: boolean;
  /** 是否启用文件输出 */
  enableFile?: boolean;
  /** 默认模块名（子 logger 会继承） */
  defaultModule?: string;
}
