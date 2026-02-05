import crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolContext, ToolCallResult } from "../types.js";

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
    const normalized = relativePath.replace(/\\/g, "/");

    // 禁止绝对路径
    if (path.isAbsolute(normalized)) {
        return { ok: false, error: "禁止使用绝对路径，请使用相对于工作区的路径" };
    }

    const absolute = path.resolve(workspaceRoot, normalized);
    const resolvedRoot = path.resolve(workspaceRoot);

    // 检查路径遍历
    if (!absolute.startsWith(resolvedRoot + path.sep) && absolute !== resolvedRoot) {
        return { ok: false, error: "路径越界：不允许访问工作区外的文件" };
    }

    return { ok: true, absolute, relative: normalized };
}

// ============ list_files 工具 ============

type FileEntry = {
    name: string;
    path: string;
    type: "file" | "directory";
    size?: number;
};

async function listDirectory(
    dir: string,
    workspaceRoot: string,
    recursive: boolean,
    maxDepth: number,
    currentDepth: number,
    entries: FileEntry[]
): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");

            if (item.isDirectory()) {
                entries.push({
                    name: item.name,
                    path: relativePath,
                    type: "directory",
                });

                if (recursive && currentDepth < maxDepth) {
                    await listDirectory(
                        fullPath,
                        workspaceRoot,
                        recursive,
                        maxDepth,
                        currentDepth + 1,
                        entries
                    );
                }
            } else if (item.isFile()) {
                try {
                    const stat = await fs.stat(fullPath);
                    entries.push({
                        name: item.name,
                        path: relativePath,
                        type: "file",
                        size: stat.size,
                    });
                } catch {
                    // 忽略无法访问的文件
                    entries.push({
                        name: item.name,
                        path: relativePath,
                        type: "file",
                    });
                }
            }
        }
    } catch {
        // 忽略无法访问的目录
    }
}

export const listFilesTool: Tool = {
    definition: {
        name: "list_files",
        description:
            "列出工作区内指定目录的文件和子目录。用于探索项目结构、查找文件位置。路径必须是相对于工作区根目录的相对路径。",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "相对于工作区根目录的目录路径（默认为当前目录 '.'）",
                },
                recursive: {
                    type: "boolean",
                    description: "是否递归列出子目录内容（默认 false）",
                },
                depth: {
                    type: "number",
                    description: "递归深度限制（默认 3，最大 10）",
                },
            },
            required: [],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "list_files";

        const makeError = (error: string): ToolCallResult => ({
            id,
            name,
            success: false,
            output: "",
            error,
            durationMs: Date.now() - start,
        });

        // 参数处理
        const pathArg = typeof args.path === "string" && args.path.trim() ? args.path.trim() : ".";
        const recursive = args.recursive === true;
        const depth = typeof args.depth === "number" && args.depth > 0
            ? Math.min(args.depth, 10)
            : 3;

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

        try {
            const stat = await fs.stat(absolute);

            if (!stat.isDirectory()) {
                return makeError(`路径不是目录：${relative}`);
            }

            const entries: FileEntry[] = [];
            await listDirectory(
                absolute,
                context.workspaceRoot,
                recursive,
                depth,
                1,
                entries
            );

            // 按类型和名称排序
            entries.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === "directory" ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            return {
                id,
                name,
                success: true,
                output: JSON.stringify({
                    path: relative || ".",
                    totalEntries: entries.length,
                    recursive,
                    depth,
                    entries,
                }),
                durationMs: Date.now() - start,
            };
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "ENOENT") {
                return makeError(`目录不存在：${relative}`);
            }
            if (code === "EACCES") {
                return makeError(`无权访问目录：${relative}`);
            }
            return makeError(err instanceof Error ? err.message : String(err));
        }
    },
};
