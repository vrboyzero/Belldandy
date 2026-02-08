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
            baseURL: options.openaiBaseUrl,
            model: options.openaiModel // [NEW] Pass model name
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
     * Process chunks that lack embeddings
     */
    async processPendingEmbeddings() {
        // Fetch pending chunks
        // First, check if we have dimensions known. If not, we might need to embed one to find out.
        let dims = 1536; // Default fallback for OpenAI text-embedding-3-small
        try {
            // Probe the model to get actual dimensions
            const probe = await this.embeddingModel.embedQuery("ping");
            if (probe && probe.length > 0) {
                dims = probe.length;
            }
        }
        catch (e) {
            console.warn("Failed to probe embedding model, skipping vector generation", e);
            return;
        }
        // Initialize vector table (this ensures vecDims is set in store)
        this.store.prepareVectorStore(dims);
        // Loop until no more pending chunks
        while (true) {
            const pending = this.store.getUnembeddedChunks(10); // Batch size 10
            if (pending.length === 0)
                break;
            console.log(`[MemoryManager] Processing ${pending.length} chunks for embedding...`);
            // Simplify content for embedding (remove excessive newlines)
            const texts = pending.map(c => c.content.replace(/\n+/g, " ").slice(0, 8000));
            try {
                const vectors = await this.embeddingModel.embedBatch(texts);
                for (let i = 0; i < pending.length; i++) {
                    const chunk = pending[i];
                    const vec = vectors[i];
                    if (vec) {
                        this.store.upsertChunkVector(chunk.id, vec, "openai");
                    }
                }
            }
            catch (err) {
                console.error("Failed to batch embed:", err);
                break;
            }
        }
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