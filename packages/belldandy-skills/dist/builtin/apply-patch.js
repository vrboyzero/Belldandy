import crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
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
function isSensitivePath(relativePath) {
    const lower = relativePath.toLowerCase();
    return SENSITIVE_PATTERNS.some(p => lower.includes(p));
}
/** 检查路径是否在黑名单中 */
function isDeniedPath(relativePath, deniedPaths) {
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
function resolveAndValidatePath(relativePath, workspaceRoot) {
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
/**
 * 解析 Unified Diff 格式的补丁
 * 支持标准的 @@ -start,count +start,count @@ 格式
 */
function parsePatch(patchText) {
    const lines = patchText.split("\n");
    const hunks = [];
    let currentHunk = null;
    for (const line of lines) {
        // 跳过文件头（--- / +++）
        if (line.startsWith("---") || line.startsWith("+++")) {
            continue;
        }
        // 检测 hunk 头
        const hunkMatch = line.match(/^@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/);
        if (hunkMatch) {
            if (currentHunk) {
                hunks.push(currentHunk);
            }
            currentHunk = {
                oldStart: parseInt(hunkMatch[1], 10),
                oldCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
                newStart: parseInt(hunkMatch[3], 10),
                newCount: hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1,
                lines: [],
            };
            continue;
        }
        // 收集 hunk 内容行
        if (currentHunk && (line.startsWith(" ") || line.startsWith("-") || line.startsWith("+"))) {
            currentHunk.lines.push(line);
        }
    }
    if (currentHunk) {
        hunks.push(currentHunk);
    }
    return { hunks };
}
/**
 * 应用补丁到文件内容
 * 支持模糊匹配（fuzzy match）以提高成功率
 */
function applyPatch(originalContent, patch, fuzzyLines = 3) {
    const originalLines = originalContent.split("\n");
    let resultLines = [...originalLines];
    let appliedCount = 0;
    let offset = 0;
    for (const hunk of patch.hunks) {
        // 提取期望的原始行（- 开头或空格开头的行）
        const expectedLines = [];
        const newLines = [];
        for (const line of hunk.lines) {
            if (line.startsWith("-")) {
                expectedLines.push(line.substring(1));
            }
            else if (line.startsWith("+")) {
                newLines.push(line.substring(1));
            }
            else if (line.startsWith(" ")) {
                expectedLines.push(line.substring(1));
                newLines.push(line.substring(1));
            }
        }
        // 尝试在目标位置附近找到匹配
        const targetLine = hunk.oldStart - 1 + offset;
        let matchIndex = -1;
        // 精确匹配
        if (matchesAt(resultLines, targetLine, expectedLines)) {
            matchIndex = targetLine;
        }
        else {
            // 模糊匹配：在目标位置附近搜索
            for (let delta = 1; delta <= fuzzyLines; delta++) {
                if (targetLine - delta >= 0 && matchesAt(resultLines, targetLine - delta, expectedLines)) {
                    matchIndex = targetLine - delta;
                    break;
                }
                if (targetLine + delta < resultLines.length && matchesAt(resultLines, targetLine + delta, expectedLines)) {
                    matchIndex = targetLine + delta;
                    break;
                }
            }
        }
        if (matchIndex === -1) {
            return {
                success: false,
                error: `无法匹配 hunk @@ -${hunk.oldStart},${hunk.oldCount} @@：内容不匹配`,
            };
        }
        // 应用替换
        resultLines.splice(matchIndex, expectedLines.length, ...newLines);
        offset += newLines.length - expectedLines.length;
        appliedCount++;
    }
    return {
        success: true,
        content: resultLines.join("\n"),
        applied: appliedCount,
    };
}
/** 检查 lines 数组在 targetLines 的 startIndex 位置是否匹配 */
function matchesAt(targetLines, startIndex, expectedLines) {
    if (startIndex < 0 || startIndex + expectedLines.length > targetLines.length) {
        return false;
    }
    for (let i = 0; i < expectedLines.length; i++) {
        // 忽略行尾空白差异
        if (targetLines[startIndex + i].trimEnd() !== expectedLines[i].trimEnd()) {
            return false;
        }
    }
    return true;
}
// ============ apply_patch 工具 ============
export const applyPatchTool = {
    definition: {
        name: "apply_patch",
        description: "应用 Unified Diff 格式的补丁到指定文件。这是修改代码的高效方式，适合精确的代码变更。支持模糊匹配以提高成功率。",
        parameters: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "相对于工作区根目录的目标文件路径",
                },
                patch: {
                    type: "string",
                    description: "Unified Diff 格式的补丁内容（包含 @@ 行和 +/- 标记）",
                },
                fuzzyLines: {
                    type: "number",
                    description: "模糊匹配的行数范围（默认 3，用于处理行号偏移）",
                },
            },
            required: ["path", "patch"],
        },
    },
    async execute(args, context) {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "apply_patch";
        const makeError = (error) => ({
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
        const patchArg = args.patch;
        if (typeof patchArg !== "string" || !patchArg.trim()) {
            return makeError("参数错误：patch 必须是非空字符串");
        }
        const fuzzyLines = typeof args.fuzzyLines === "number" && args.fuzzyLines >= 0
            ? Math.min(args.fuzzyLines, 20)
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
            return makeError(`禁止修改路径：${denied}`);
        }
        // 敏感文件检查
        if (isSensitivePath(relative)) {
            return makeError("禁止修改敏感文件");
        }
        // 白名单检查
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
        try {
            // 读取原始文件
            const originalContent = await fs.readFile(absolute, "utf-8");
            // 解析补丁
            const parsed = parsePatch(patchArg);
            if (parsed.hunks.length === 0) {
                return makeError("补丁解析失败：未找到有效的 hunk（确保包含 @@ 行）");
            }
            // 应用补丁
            const result = applyPatch(originalContent, parsed, fuzzyLines);
            if (!result.success) {
                return makeError(result.error);
            }
            // 写入文件
            await fs.writeFile(absolute, result.content, "utf-8");
            return {
                id,
                name,
                success: true,
                output: JSON.stringify({
                    path: relative,
                    hunksApplied: result.applied,
                    originalSize: originalContent.length,
                    newSize: result.content.length,
                }),
                durationMs: Date.now() - start,
            };
        }
        catch (err) {
            const code = err.code;
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
//# sourceMappingURL=apply-patch.js.map