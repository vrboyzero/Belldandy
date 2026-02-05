/**
 * Belldandy Logger - 控制台输出 Transport
 *
 * 支持彩色输出，便于开发调试时快速区分日志级别。
 */

import type { LogEntry, LogTransport } from "./types.js";

/** ANSI 颜色码 */
const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
} as const;

function colorize(level: LogEntry["level"], text: string): string {
  switch (level) {
    case "error":
      return `${COLORS.red}${text}${COLORS.reset}`;
    case "warn":
      return `${COLORS.yellow}${text}${COLORS.reset}`;
    case "info":
      return `${COLORS.blue}${text}${COLORS.reset}`;
    case "debug":
      return `${COLORS.gray}${text}${COLORS.reset}`;
    default:
      return text;
  }
}

export function createConsoleTransport(): LogTransport {
  return {
    write(entry: LogEntry, formatted: string) {
      const colored = colorize(entry.level, formatted);
      if (entry.level === "error") {
        process.stderr.write(colored + "\n");
      } else {
        process.stdout.write(colored + "\n");
      }
    },
  };
}
