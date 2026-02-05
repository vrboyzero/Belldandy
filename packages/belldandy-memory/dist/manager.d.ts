import { type IndexerOptions } from "./indexer.js";
import type { MemorySearchResult, MemoryIndexStatus } from "./types.js";
export interface MemoryManagerOptions {
    workspaceRoot: string;
    storePath?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    indexerOptions?: IndexerOptions;
}
export declare class MemoryManager {
    private store;
    private indexer;
    private embeddingModel;
    private workspaceRoot;
    constructor(options: MemoryManagerOptions);
    /**
     * Index files in the workspace
     */
    indexWorkspace(): Promise<void>;
    /**
     * Search memory (Hybrid)
     */
    search(query: string, limit?: number): Promise<MemorySearchResult[]>;
    /**
     * Process chunks that lack embeddings (simple implementation for MVP)
     * Real implementation would utilize a queue or 'dirty' flag.
     */
    private processPendingEmbeddings;
    getStatus(): MemoryIndexStatus;
    close(): void;
}
//# sourceMappingURL=manager.d.ts.map