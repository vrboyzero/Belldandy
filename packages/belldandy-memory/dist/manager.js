import { MemoryStore } from "./store.js";
import { MemoryIndexer } from "./indexer.js";
import { OpenAIEmbeddingProvider } from "./embeddings/openai.js";
import path from "node:path";
import { mkdirSync } from "node:fs";
export class MemoryManager {
    store;
    indexer;
    embeddingModel;
    workspaceRoot;
    constructor(options) {
        this.workspaceRoot = options.workspaceRoot;
        // Default store path: .belldandy/memory.sqlite
        const defaultStorePath = path.join(options.workspaceRoot, ".belldandy", "memory.sqlite");
        const storePath = options.storePath || defaultStorePath;
        // Ensure dir exists synchronously
        try {
            const dir = path.dirname(storePath);
            mkdirSync(dir, { recursive: true });
        }
        catch (err) {
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
    async indexWorkspace() {
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
    async search(query, limit = 5) {
        // 1. Embed query
        let queryVec = null;
        try {
            queryVec = await this.embeddingModel.embedQuery(query);
        }
        catch (err) {
            console.warn("Embedding failed, falling back to keyword search only", err);
        }
        // 2. Hybrid search
        return this.store.searchHybrid(query, queryVec, { limit });
    }
    /**
     * Process chunks that lack embeddings (simple implementation for MVP)
     * Real implementation would utilize a queue or 'dirty' flag.
     */
    async processPendingEmbeddings() {
        // This is a placeholder. 
        // To make this work, store.ts needs a way to query chunks without embeddings.
        // Let's implement a simple "scan and embed" for MVP.
        // NOTE: For efficiency, we should query `chunks` where id NOT IN `chunks_vec`.
        // Since we don't have that method exposed in Store yet, we'll skip this for the *very* first pass 
        // OR we add a method to Store.
        // Let's assume we will add `getChunksWithoutEmbeddings` to Store.
    }
    getStatus() {
        const basic = this.store.getStatus();
        const vec = this.store.getVectorStatus();
        return {
            ...basic,
            vectorIndexed: vec.indexed,
            vectorCached: vec.cached
        };
    }
    close() {
        this.indexer.stopWatching().catch(console.error);
        this.store.close();
    }
}
//# sourceMappingURL=manager.js.map