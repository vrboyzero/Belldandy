import { MemoryStore } from "./store.js";
import { MemoryIndexer, type IndexerOptions } from "./indexer.js";
import { OpenAIEmbeddingProvider } from "./embeddings/openai.js";
import type { EmbeddingModel } from "./embeddings/index.js";
import type { MemorySearchResult, MemoryIndexStatus } from "./types.js";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { mkdirSync } from "node:fs";

export interface MemoryManagerOptions {
    workspaceRoot: string;
    storePath?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    indexerOptions?: IndexerOptions;
}

export class MemoryManager {
    private store: MemoryStore;
    private indexer: MemoryIndexer;
    private embeddingModel: EmbeddingModel;
    private workspaceRoot: string;

    constructor(options: MemoryManagerOptions) {
        this.workspaceRoot = options.workspaceRoot;

        // Default store path: .belldandy/memory.sqlite
        const defaultStorePath = path.join(options.workspaceRoot, ".belldandy", "memory.sqlite");
        const storePath = options.storePath || defaultStorePath;

        // Ensure dir exists synchronously
        try {
            const dir = path.dirname(storePath);
            mkdirSync(dir, { recursive: true });
        } catch (err) {
            console.warn("Failed to create memory directory:", err);
        }

        this.store = new MemoryStore(storePath);

        this.embeddingModel = new OpenAIEmbeddingProvider({
            apiKey: options.openaiApiKey,
            baseURL: options.openaiBaseUrl
        });

        this.indexer = new MemoryIndexer(this.store, options.indexerOptions);
    }

    /**
     * Index files in the workspace
     */
    async indexWorkspace(): Promise<void> {
        await this.indexer.indexDirectory(this.workspaceRoot);
        await this.processPendingEmbeddings();

        // Start watching for changes
        // TODO: make this configurable? For MVP we enable it by default if it's safe.
        // Or better, only if options say so. But options.indexerOptions.watch defaults to false in Indexer.
        // Let's rely on the passed options.
        await this.indexer.startWatching(this.workspaceRoot);
    }

    /**
     * Search memory (Hybrid)
     */
    async search(query: string, limit = 5): Promise<MemorySearchResult[]> {
        // 1. Embed query
        let queryVec: number[] | null = null;
        try {
            queryVec = await this.embeddingModel.embedQuery(query);
        } catch (err) {
            console.warn("Embedding failed, falling back to keyword search only", err);
        }

        // 2. Hybrid search
        return this.store.searchHybrid(query, queryVec, { limit });
    }

    /**
     * Process chunks that lack embeddings (simple implementation for MVP)
     * Real implementation would utilize a queue or 'dirty' flag.
     */
    private async processPendingEmbeddings(): Promise<void> {
        // This is a placeholder. 
        // To make this work, store.ts needs a way to query chunks without embeddings.
        // Let's implement a simple "scan and embed" for MVP.
        // NOTE: For efficiency, we should query `chunks` where id NOT IN `chunks_vec`.

        // Since we don't have that method exposed in Store yet, we'll skip this for the *very* first pass 
        // OR we add a method to Store.
        // Let's assume we will add `getChunksWithoutEmbeddings` to Store.
    }

    getStatus(): MemoryIndexStatus {
        const basic = this.store.getStatus();
        const vec = this.store.getVectorStatus();
        return {
            ...basic,
            vectorIndexed: vec.indexed,
            vectorCached: vec.cached
        };
    }

    close(): void {
        this.indexer.stopWatching().catch(console.error);
        this.store.close();
    }
}
