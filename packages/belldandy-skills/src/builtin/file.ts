import crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolCallResult } from "../types.js";

/** 敏感文件模式（禁止读取） */
const SENSITIVE_PATTERNS = [
  ".env",
  ".env.local",
  ".env.production",
  "credentials",
  "secret",
  ".key",
  ".pem",
  ".p12",
  ".pfx",
  "id_rsa",
  "id_ed25519",
  ".ssh",
  "password",
  "token",
];

/** 检查路径是否包含敏感文件模式 */
function isSensitivePath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return SENSITIVE_PATTERNS.some(p => lower.includes(p));
}

/** 检查路径是否在黑名单中 */
function isDeniedPath(relativePath: string, deniedPaths: string[]): string | null {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  for (const denied of deniedPaths) {
    const deniedNorm = denied.replace(/\\/g, "/").toLowerCase();
    if (normalized.includes(deniedNorm)) {
      return denied;
    }
  }
  return null;
}

/** 规范化并验证路径在工作区内 */
function resolveAndValidatePath(
  relativePath: string,
  workspaceRoot: string
): { ok: true; absolute: string; relative: string } | { ok: false; error: string } {
  // 规范化相对路径
  const normalized = relativePath.replace(/\\/g, "/");

  // 禁止绝对路径
  if (path.isAbsolute(normalized)) {
    return { ok: false, error: "禁止使用绝对路径，请使用相对于工作区的路径" };
  }

  // 解析为绝对路径
  const absolute = path.resolve(workspaceRoot, normalized);
  const resolvedRoot = path.resolve(workspaceRoot);

  // 检查路径遍历
  if (!absolute.startsWith(resolvedRoot + path.sep) && absolute !== resolvedRoot) {
    return { ok: false, error: "路径越界：不允许访问工作区外的文件" };
  }

  return { ok: true, absolute, relative: normalized };
}

// ============ file_read 工具 ============

export const fileReadTool: Tool = {
  definition: {
    name: "file_read",
    description: "读取工作区内文件内容。路径必须是相对于工作区根目录的相对路径，禁止读取敏感文件（如 .env、密钥等）。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "相对于工作区根目录的文件路径",
        },
        encoding: {
          type: "string",
          description: "编码方式（默认 utf-8）",
          enum: ["utf-8", "base64"],
        },
        maxBytes: {
          type: "number",
          description: "最大读取字节数（默认 102400，即 100KB）",
        },
      },
      required: ["path"],
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "file_read";

    const makeError = (error: string): ToolCallResult => ({
      id,
      name,
      success: false,
      output: "",
      error,
      durationMs: Date.now() - start,
    });

    // 参数校验
    const pathArg = args.path;
    if (typeof pathArg !== "string" || !pathArg.trim()) {
      return makeError("参数错误：path 必须是非空字符串");
    }

    // 路径验证
    const pathResult = resolveAndValidatePath(pathArg, context.workspaceRoot);
    if (!pathResult.ok) {
      return makeError(pathResult.error);
    }

    const { absolute, relative } = pathResult;

    // 黑名单检查
    const denied = isDeniedPath(relative, context.policy.deniedPaths);
    if (denied) {
      return makeError(`禁止访问路径：${denied}`);
    }

    // 敏感文件检查
    if (isSensitivePath(relative)) {
      return makeError("禁止读取敏感文件（如 .env、密钥、凭证等）");
    }

    // 读取文件
    const encoding = (args.encoding as "utf-8" | "base64") || "utf-8";
    const maxBytes = typeof args.maxBytes === "number" && args.maxBytes > 0
      ? Math.min(args.maxBytes, 1024 * 1024) // 最大 1MB
      : 100 * 1024; // 默认 100KB

    try {
      const stat = await fs.stat(absolute);

      if (!stat.isFile()) {
        return makeError(`路径不是文件：${relative}`);
      }

      // 读取文件（限制大小）
      const handle = await fs.open(absolute, "r");
      try {
        const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);

        let content: string;
        if (encoding === "base64") {
          content = buffer.subarray(0, bytesRead).toString("base64");
        } else {
          content = buffer.subarray(0, bytesRead).toString("utf-8");
        }

        const truncated = stat.size > maxBytes;

        return {
          id,
          name,
          success: true,
          output: JSON.stringify({
            path: relative,
            size: stat.size,
            bytesRead,
            truncated,
            encoding,
            content,
          }),
          durationMs: Date.now() - start,
        };
      } finally {
        await handle.close();
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return makeError(`文件不存在：${relative}`);
      }
      if (code === "EACCES") {
        return makeError(`无权访问文件：${relative}`);
      }
      return makeError(err instanceof Error ? err.message : String(err));
    }
  },
};

// ============ file_write 工具 ============

export const fileWriteTool: Tool = {
  definition: {
    name: "file_write",
    description: "写入工作区内文件。路径必须是相对于工作区根目录的相对路径。如果配置了写入白名单，则只能写入白名单内的目录。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "相对于工作区根目录的文件路径",
        },
        content: {
          type: "string",
          description: "要写入的内容",
        },
        mode: {
          type: "string",
          description: "写入模式（默认 overwrite）",
          enum: ["overwrite", "append"],
        },
        createDirs: {
          type: "boolean",
          description: "是否自动创建父目录（默认 true）",
        },
      },
      required: ["path", "content"],
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "file_write";

    const makeError = (error: string): ToolCallResult => ({
      id,
      name,
      success: false,
      output: "",
      error,
      durationMs: Date.now() - start,
    });

    // 参数校验
    const pathArg = args.path;
    if (typeof pathArg !== "string" || !pathArg.trim()) {
      return makeError("参数错误：path 必须是非空字符串");
    }

    const content = args.content;
    if (typeof content !== "string") {
      return makeError("参数错误：content 必须是字符串");
    }

    // 路径验证
    const pathResult = resolveAndValidatePath(pathArg, context.workspaceRoot);
    if (!pathResult.ok) {
      return makeError(pathResult.error);
    }

    const { absolute, relative } = pathResult;

    // 黑名单检查
    const denied = isDeniedPath(relative, context.policy.deniedPaths);
    if (denied) {
      return makeError(`禁止写入路径：${denied}`);
    }

    // 敏感文件检查（禁止写入敏感文件）
    if (isSensitivePath(relative)) {
      return makeError("禁止写入敏感文件路径");
    }

    // 白名单检查（如果配置了白名单，则只能写入白名单内的目录）
    const { allowedPaths } = context.policy;
    if (allowedPaths.length > 0) {
      const normalizedRelative = relative.replace(/\\/g, "/").toLowerCase();
      const allowed = allowedPaths.some(p => {
        const normalizedAllowed = p.replace(/\\/g, "/").toLowerCase();
        return normalizedRelative.startsWith(normalizedAllowed + "/") ||
          normalizedRelative === normalizedAllowed;
      });
      if (!allowed) {
        return makeError(`路径不在写入白名单中。允许的路径：${allowedPaths.join(", ")}`);
      }
    }

    // 写入文件
    const mode = (args.mode as "overwrite" | "append") || "overwrite";
    const createDirs = args.createDirs !== false; // 默认 true

    try {
      // 创建父目录
      if (createDirs) {
        await fs.mkdir(path.dirname(absolute), { recursive: true });
      }

      if (mode === "append") {
        await fs.appendFile(absolute, content, "utf-8");
      } else {
        await fs.writeFile(absolute, content, "utf-8");
      }

      const stat = await fs.stat(absolute);

      return {
        id,
        name,
        success: true,
        output: JSON.stringify({
          path: relative,
          bytesWritten: Buffer.byteLength(content, "utf-8"),
          mode,
          totalSize: stat.size,
        }),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EACCES") {
        return makeError(`无权写入文件：${relative}`);
      }
      if (code === "ENOENT" && !createDirs) {
        return makeError(`父目录不存在：${path.dirname(relative)}`);
      }
      return makeError(err instanceof Error ? err.message : String(err));
    }
  },
};

// ============ file_delete 工具 ============

export const fileDeleteTool: Tool = {
  definition: {
    name: "file_delete",
    description: "删除工作区内的文件。路径必须是相对于工作区根目录的相对路径，禁止删除敏感文件（如 .env）。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "相对于工作区根目录的文件路径",
        },
      },
      required: ["path"],
    },
  },

  async execute(args, context): Promise<ToolCallResult> {
    const start = Date.now();
    const id = crypto.randomUUID();
    const name = "file_delete";

    const makeError = (error: string): ToolCallResult => ({
      id,
      name,
      success: false,
      output: "",
      error,
      durationMs: Date.now() - start,
    });

    // 参数校验
    const pathArg = args.path;
    if (typeof pathArg !== "string" || !pathArg.trim()) {
      return makeError("参数错误：path 必须是非空字符串");
    }

    // 路径验证
    const pathResult = resolveAndValidatePath(pathArg, context.workspaceRoot);
    if (!pathResult.ok) {
      return makeError(pathResult.error);
    }

    const { relative } = pathResult;

    // 黑名单检查
    const denied = isDeniedPath(relative, context.policy.deniedPaths);
    if (denied) {
      return makeError(`禁止删除路径：${denied}`);
    }

    // 敏感文件检查
    if (isSensitivePath(relative)) {
      return makeError("禁止删除敏感文件");
    }

    try {
      await fs.unlink(pathResult.absolute);

      return {
        id,
        name,
        success: true,
        output: JSON.stringify({
          path: relative,
          status: "deleted",
        }),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return makeError(`文件不存在：${relative}`);
      }
      if (code === "EACCES" || code === "EPERM") {
        return makeError(`无权删除文件：${relative}`);
      }
      return makeError(err instanceof Error ? err.message : String(err));
    }
  },
};
