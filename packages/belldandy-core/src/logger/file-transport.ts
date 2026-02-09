/**
 * Belldandy Logger - 文件输出 Transport
 *
 * 功能：
 * - 按日期分文件：logs/2026-02-05.log
 * - 按大小轮转：单文件超过 maxFileSize 时创建 .1.log、.2.log
 * - 启动时异步清理超过 maxRetentionDays 的旧日志
 */

import fs from "node:fs";
import path from "node:path";
import type { LogEntry, LogTransport } from "./types.js";

export interface FileTransportOptions {
  dir: string;
  maxFileSize: number;
  maxRetentionDays: number;
}


function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** 解析 "10MB"、"1GB" 等为字节数 */
export function parseSizeToBytes(s: string): number {
  const m = s.trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i);
  if (!m) return 10 * 1024 * 1024; // 默认 10MB
  const n = Number(m[1]);
  const unit = (m[2] ?? "b").toLowerCase();
  const factors: Record<string, number> = { b: 1, kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  return Math.floor(n * (factors[unit] ?? 1));
}

/** 清理过期日志（异步，不阻塞） */
async function cleanupOldLogs(dir: string, maxRetentionDays: number): Promise<void> {
  try {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const cutoff = now - maxRetentionDays * 24 * 60 * 60 * 1000;

    for (const f of files) {
      if (!f.endsWith(".log")) continue;
      const fp = path.join(dir, f);
      try {
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          // 使用 console 避免循环依赖（此时 logger 可能尚未完全初始化）
          process.stdout.write(`[logger] Cleaned old log: ${f}\n`);
        }
      } catch {
        // 忽略单个文件错误
      }
    }
  } catch {
    // 忽略清理失败
  }
}

export function createFileTransport(opts: FileTransportOptions): LogTransport {
  const { dir, maxFileSize, maxRetentionDays } = opts;
  ensureDir(dir);

  let currentDate = "";
  let currentPath = "";
  let currentSize = 0;
  let writeStream: fs.WriteStream | null = null;

  /** 根据日期和大小获取当前应写入的文件路径 */
  function getCurrentPath(): string {
    // [FIX] Use local time instead of UTC to ensure log names match system date
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const today = `${year}-${month}-${day}`;

    if (currentDate !== today) {
      currentDate = today;
      currentPath = path.join(dir, `${today}.log`);
      currentSize = 0;
      if (writeStream) {
        writeStream.end();
        writeStream = null;
      }
    }

    if (writeStream && currentSize >= maxFileSize) {
      writeStream.end();
      writeStream = null;
      let suffix = 1;
      let nextPath = path.join(dir, `${currentDate}.${suffix}.log`);
      while (fs.existsSync(nextPath)) {
        suffix++;
        nextPath = path.join(dir, `${currentDate}.${suffix}.log`);
      }
      currentPath = nextPath;
      currentSize = 0;
    }

    return currentPath;
  }

  /** 获取或创建写入流 */
  function getStream(): fs.WriteStream {
    const p = getCurrentPath();
    if (!writeStream || writeStream.path !== p) {
      writeStream?.end();
      writeStream = fs.createWriteStream(p, { flags: "a" });
      try {
        currentSize = fs.statSync(p).size;
      } catch {
        currentSize = 0;
      }
    }
    return writeStream;
  }

  // 启动时异步清理旧日志
  void cleanupOldLogs(dir, maxRetentionDays);

  return {
    write(_entry: LogEntry, formatted: string) {
      try {
        const line = formatted.endsWith("\n") ? formatted : formatted + "\n";
        const stream = getStream();
        stream.write(line);
        currentSize += Buffer.byteLength(line, "utf-8");
      } catch (err) {
        process.stderr.write(`[logger] Failed to write log file: ${(err as Error).message}\n`);
      }
    },
    close() {
      if (writeStream) {
        writeStream.end();
        writeStream = null;
      }
    },
  };
}
