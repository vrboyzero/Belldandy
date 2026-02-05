/**
 * Memory 文件项
 */
export type MemoryFileEntry = {
    /** 相对路径（相对于 workspaceDir） */
    path: string;
    /** 绝对路径 */
    absPath: string;
    /** 文件名 */
    name: string;
    /** 是否是 MEMORY.md（长期记忆） */
    isMainMemory: boolean;
    /** 是否是日期文件（memory/YYYY-MM-DD.md） */
    isDaily: boolean;
    /** 日期（如果是日期文件） */
    date?: string;
};
/**
 * 列出 Memory 文件的结果
 */
export type ListMemoryFilesResult = {
    /** 所有 memory 文件 */
    files: MemoryFileEntry[];
    /** 是否存在 MEMORY.md */
    hasMainMemory: boolean;
    /** 日期文件数量 */
    dailyCount: number;
};
/**
 * 规范化相对路径
 */
export declare function normalizeRelPath(value: string): string;
/**
 * 检查路径是否是 Memory 路径
 */
export declare function isMemoryPath(relPath: string): boolean;
/**
 * 列出 Workspace 中的所有 Memory 文件
 *
 * 按照 moltbot 约定：
 * - MEMORY.md 或 memory.md（长期记忆）
 * - memory/YYYY-MM-DD.md（日常记忆）
 * - memory/*.md（其他 memory 文件）
 */
export declare function listMemoryFiles(workspaceDir: string): Promise<ListMemoryFilesResult>;
/**
 * 确保 memory 目录存在
 */
export declare function ensureMemoryDir(workspaceDir: string): Promise<string>;
/**
 * 获取今天的 memory 文件路径
 */
export declare function getTodayMemoryPath(workspaceDir: string): string;
/**
 * 读取 Memory 文件内容
 *
 * @param workspaceDir Workspace 根目录
 * @param relPath 相对路径（如 "MEMORY.md" 或 "memory/2026-01-31.md"）
 * @param from 起始行号（1-indexed，可选）
 * @param lines 读取行数（可选）
 */
export declare function readMemoryFile(params: {
    workspaceDir: string;
    relPath: string;
    from?: number;
    lines?: number;
}): Promise<{
    text: string;
    path: string;
    totalLines: number;
}>;
/**
 * 追加内容到今天的 memory 文件
 */
export declare function appendToTodayMemory(workspaceDir: string, content: string): Promise<string>;
//# sourceMappingURL=memory-files.d.ts.map