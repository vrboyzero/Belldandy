import OpenAI from "openai";
export class OpenAIEmbeddingProvider {
    openai;
    modelName;
    dimension;
    constructor(options = {}) {
        this.openai = new OpenAI({
            apiKey: options.apiKey || process.env.OPENAI_API_KEY,
            baseURL: options.baseURL || process.env.OPENAI_BASE_URL,
        });
        this.modelName = options.model || "text-embedding-3-small";
        // text-embedding-3-small default is 1536, but can be scaled down. 3-large is 3072.
        this.dimension = options.dimension || 1536;
        console.log(`[Embedding] Initialized OpenAI provider with model: ${this.modelName}`);
    }
    async embedQuery(text) {
        const response = await this.openai.embeddings.create({
            model: this.modelName,
            input: text,
            dimensions: this.modelName.includes("text-embedding-3") ? this.dimension : undefined,
        });
        return response.data[0].embedding;
    }
    async embedBatch(texts) {
        // OpenAI batch limit logic (simplified for MVP)
        const response = await this.openai.embeddings.create({
            model: this.modelName,
            input: texts,
            dimensions: this.modelName.includes("text-embedding-3") ? this.dimension : undefined,
        });
        return response.data.map(d => d.embedding);
    }
}
//# sourceMappingURL=openai.js.map