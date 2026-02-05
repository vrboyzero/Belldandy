import crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Tool, ToolCallResult, ToolContext } from "../../types.js";
import { parsePatchText } from "./dsl.js";
import { applyUpdateChunks } from "./match.js";

// ============ Helper Functions ============

/** 敏感文件模式（禁止修改） */
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
    const normalized = relativePath.replace(/\\/g, "/");

    if (path.isAbsolute(normalized)) {
        return { ok: false, error: "禁止使用绝对路径，请使用相对于工作区的路径" };
    }

    const absolute = path.resolve(workspaceRoot, normalized);
    const resolvedRoot = path.resolve(workspaceRoot);

    if (!absolute.startsWith(resolvedRoot + path.sep) && absolute !== resolvedRoot) {
        return { ok: false, error: "路径越界：不允许访问工作区外的文件" };
    }

    return { ok: true, absolute, relative: normalized };
}

async function ensureDir(filePath: string) {
    const parent = path.dirname(filePath);
    if (!parent || parent === ".") return;
    await fs.mkdir(parent, { recursive: true });
}

// ============ apply_patch Tool ============

export const applyPatchTool: Tool = {
    definition: {
        name: "apply_patch",
        description:
            "使用 Unified Diff 变体格式（基于 Blocks）修改一个或多个文件。支持在一次调用中执行添加、删除、更新和移动操作。**这是修改代码的首选方式**。",
        parameters: {
            type: "object",
            properties: {
                input: {
                    type: "string",
                    description: "包含 *** Begin Patch 和 *** End Patch 标记的完整补丁内容",
                },
            },
            required: ["input"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "apply_patch";

        const makeError = (error: string): ToolCallResult => ({
            id,
            name,
            success: false,
            output: "",
            error,
            durationMs: Date.now() - start,
        });

        // 参数校验
        const inputArg = args.input;
        if (typeof inputArg !== "string" || !inputArg.trim()) {
            return makeError("参数错误：input 必须是非空字符串");
        }

        try {
            // 1. 解析 Patch DSL
            const parsed = parsePatchText(inputArg);
            if (parsed.hunks.length === 0) {
                return makeError("未找到任何修改（No Hunks found）");
            }

            const summary = {
                added: [] as string[],
                modified: [] as string[],
                deleted: [] as string[],
            };
            const seen = {
                added: new Set<string>(),
                modified: new Set<string>(),
                deleted: new Set<string>(),
            };

            const recordSummary = (bucket: keyof typeof summary, file: string) => {
                if (seen[bucket].has(file)) return;
                seen[bucket].add(file);
                summary[bucket].push(file);
            };

            // 2. 依次应用 Hunks
            // 注意：这里没有像 Moltbot 一样支持 AbortSignal，因为 execute 本身是原子的
            for (const hunk of parsed.hunks) {
                // 安全检查：路径校验
                const pathCheck = resolveAndValidatePath(hunk.path, context.workspaceRoot);
                if (!pathCheck.ok) throw new Error(`[${hunk.path}] ${pathCheck.error}`);
                const { absolute, relative } = pathCheck;

                // 安全检查：策略校验
                if (isSensitivePath(relative)) throw new Error(`[${relative}] 禁止修改敏感文件`);

                const denied = isDeniedPath(relative, context.policy.deniedPaths);
                if (denied) throw new Error(`[${relative}] 禁止修改路径：${denied}`);

                // 白名单检查
                if (context.policy.allowedPaths.length > 0) {
                    const allowed = context.policy.allowedPaths.some(p => {
                        const normalizedAllowed = p.replace(/\\/g, "/").toLowerCase();
                        const normalizedRelative = relative.replace(/\\/g, "/").toLowerCase();
                        return normalizedRelative.startsWith(normalizedAllowed + "/") || normalizedRelative === normalizedAllowed;
                    });
                    if (!allowed) throw new Error(`[${relative}] 路径不在写入白名单中`);
                }

                if (hunk.kind === "add") {
                    await ensureDir(absolute);
                    await fs.writeFile(absolute, hunk.contents, "utf8");
                    recordSummary("added", relative);
                    continue;
                }

                if (hunk.kind === "delete") {
                    await fs.rm(absolute, { force: true });
                    recordSummary("deleted", relative);
                    continue;
                }

                if (hunk.kind === "update") {
                    // 应用 Update Chunks
                    const newContent = await applyUpdateChunks(absolute, hunk.chunks);

                    if (hunk.movePath) {
                        // 移动文件逻辑
                        const moveCheck = resolveAndValidatePath(hunk.movePath, context.workspaceRoot);
                        if (!moveCheck.ok) throw new Error(`[MoveTo: ${hunk.movePath}] ${moveCheck.error}`);

                        await ensureDir(moveCheck.absolute);
                        await fs.writeFile(moveCheck.absolute, newContent, "utf8");
                        await fs.rm(absolute, { force: true }); // 删除旧文件
                        recordSummary("modified", `${relative} -> ${moveCheck.relative}`);
                    } else {
                        // 原地更新
                        await fs.writeFile(absolute, newContent, "utf8");
                        recordSummary("modified", relative);
                    }
                }
            }

            return {
                id,
                name,
                success: true,
                output: JSON.stringify({
                    summary,
                    details: "Patch applied successfully",
                }),
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return makeError(err instanceof Error ? err.message : String(err));
        }
    },
};
