/** 记忆块 */
export type MemoryType = "core" | "daily" | "session" | "other";
export interface MemoryChunk {
    id: string;
    sourcePath: string;
    sourceType: "file" | "session" | "manual";
    memoryType: MemoryType;
    content: string;
    startLine?: number;
    endLine?: number;
    metadata?: Record<string, any>;
}
/** 检索结果 */
export interface MemorySearchResult {
    id: string;
    sourcePath: string;
    sourceType: string;
    memoryType?: MemoryType;
    content?: string;
    snippet: string;
    score: number;
    metadata?: Record<string, any>;
    startLine?: number;
    endLine?: number;
}
/** 索引状态 */
export type MemoryIndexStatus = {
    files: number;
    chunks: number;
    lastIndexedAt?: string;
    vectorIndexed?: number;
    vectorCached?: number;
};
//# sourceMappingURL=types.d.ts.map