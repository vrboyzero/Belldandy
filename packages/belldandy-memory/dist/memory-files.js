import fs from "node:fs/promises";
import path from "node:path";
const DATE_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.md$/;
/**
 * 检查文件是否存在
 */
async function exists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * 递归遍历目录
 */
async function walkDir(dir, files) {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                await walkDir(full, files);
                continue;
            }
            if (!entry.isFile())
                continue;
            if (!entry.name.endsWith(".md"))
                continue;
            files.push(full);
        }
    }
    catch {
        // Directory doesn't exist or can't be read
    }
}
/**
 * 规范化相对路径
 */
export function normalizeRelPath(value) {
    const trimmed = value.trim().replace(/^[./]+/, "");
    return trimmed.replace(/\\/g, "/");
}
/**
 * 检查路径是否是 Memory 路径
 */
export function isMemoryPath(relPath) {
    const normalized = normalizeRelPath(relPath);
    if (!normalized)
        return false;
    if (normalized === "MEMORY.md" || normalized === "memory.md")
        return true;
    return normalized.startsWith("memory/");
}
/**
 * 列出 Workspace 中的所有 Memory 文件
 *
 * 按照 moltbot 约定：
 * - MEMORY.md 或 memory.md（长期记忆）
 * - memory/YYYY-MM-DD.md（日常记忆）
 * - memory/*.md（其他 memory 文件）
 */
export async function listMemoryFiles(workspaceDir) {
    const entries = [];
    // 1. 检查 MEMORY.md
    const memoryFile = path.join(workspaceDir, "MEMORY.md");
    const altMemoryFile = path.join(workspaceDir, "memory.md");
    if (await exists(memoryFile)) {
        entries.push({
            path: "MEMORY.md",
            absPath: memoryFile,
            name: "MEMORY.md",
            isMainMemory: true,
            isDaily: false,
        });
    }
    else if (await exists(altMemoryFile)) {
        entries.push({
            path: "memory.md",
            absPath: altMemoryFile,
            name: "memory.md",
            isMainMemory: true,
            isDaily: false,
        });
    }
    // 2. 扫描 memory/ 目录
    const memoryDir = path.join(workspaceDir, "memory");
    const mdFiles = [];
    await walkDir(memoryDir, mdFiles);
    for (const absPath of mdFiles) {
        const relPath = path.relative(workspaceDir, absPath).replace(/\\/g, "/");
        const name = path.basename(absPath);
        const dateMatch = name.match(DATE_FILE_PATTERN);
        entries.push({
            path: relPath,
            absPath,
            name,
            isMainMemory: false,
            isDaily: !!dateMatch,
            date: dateMatch ? dateMatch[1] : undefined,
        });
    }
    // 去重（如果有符号链接等）
    const seen = new Set();
    const deduped = [];
    for (const entry of entries) {
        let key = entry.absPath;
        try {
            key = await fs.realpath(entry.absPath);
        }
        catch { }
        if (seen.has(key))
            continue;
        seen.add(key);
        deduped.push(entry);
    }
    return {
        files: deduped,
        hasMainMemory: deduped.some(f => f.isMainMemory),
        dailyCount: deduped.filter(f => f.isDaily).length,
    };
}
/**
 * 确保 memory 目录存在
 */
export async function ensureMemoryDir(workspaceDir) {
    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });
    return memoryDir;
}
/**
 * 获取今天的 memory 文件路径
 */
export function getTodayMemoryPath(workspaceDir) {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(workspaceDir, "memory", `${today}.md`);
}
/**
 * 读取 Memory 文件内容
 *
 * @param workspaceDir Workspace 根目录
 * @param relPath 相对路径（如 "MEMORY.md" 或 "memory/2026-01-31.md"）
 * @param from 起始行号（1-indexed，可选）
 * @param lines 读取行数（可选）
 */
export async function readMemoryFile(params) {
    const { workspaceDir, relPath, from, lines } = params;
    const normalized = normalizeRelPath(relPath);
    // 安全检查：只允许读取 memory 路径
    if (!isMemoryPath(normalized)) {
        throw new Error(`Path is not a memory file: ${relPath}`);
    }
    const absPath = path.join(workspaceDir, normalized);
    // 检查文件存在
    if (!(await exists(absPath))) {
        throw new Error(`Memory file not found: ${normalized}`);
    }
    // 检查路径遍历
    const resolvedPath = await fs.realpath(absPath);
    const resolvedWorkspace = await fs.realpath(workspaceDir);
    if (!resolvedPath.startsWith(resolvedWorkspace)) {
        throw new Error(`Path traversal detected: ${relPath}`);
    }
    // 读取内容
    const content = await fs.readFile(absPath, "utf-8");
    const allLines = content.split("\n");
    const totalLines = allLines.length;
    // 如果指定了行号范围
    if (from !== undefined && from >= 1) {
        const startIdx = from - 1; // 转为 0-indexed
        const endIdx = lines !== undefined ? startIdx + lines : allLines.length;
        const selectedLines = allLines.slice(startIdx, endIdx);
        return {
            text: selectedLines.join("\n"),
            path: normalized,
            totalLines,
        };
    }
    return {
        text: content,
        path: normalized,
        totalLines,
    };
}
/**
 * 追加内容到今天的 memory 文件
 */
export async function appendToTodayMemory(workspaceDir, content) {
    await ensureMemoryDir(workspaceDir);
    const filePath = getTodayMemoryPath(workspaceDir);
    // 如果文件不存在，创建带日期头的新文件
    if (!(await exists(filePath))) {
        const today = new Date().toISOString().slice(0, 10);
        const header = `# ${today}\n\n`;
        await fs.writeFile(filePath, header + content.trim() + "\n", "utf-8");
    }
    else {
        // 追加到现有文件
        await fs.appendFile(filePath, "\n" + content.trim() + "\n", "utf-8");
    }
    return filePath;
}
//# sourceMappingURL=memory-files.js.map