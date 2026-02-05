import type { EmbeddingModel, EmbeddingVector } from "./index.js";
import OpenAI from "openai";

export class OpenAIEmbeddingProvider implements EmbeddingModel {
    private openai: OpenAI;
    readonly modelName: string;
    readonly dimension: number;

    constructor(options: { apiKey?: string; baseURL?: string; model?: string; dimension?: number } = {}) {
        this.openai = new OpenAI({
            apiKey: options.apiKey || process.env.OPENAI_API_KEY,
            baseURL: options.baseURL || process.env.OPENAI_BASE_URL,
        });
        this.modelName = options.model || "text-embedding-3-small";
        // text-embedding-3-small default is 1536, but can be scaled down. 3-large is 3072.
        this.dimension = options.dimension || 1536;
    }

    async embedQuery(text: string): Promise<EmbeddingVector> {
        const response = await this.openai.embeddings.create({
            model: this.modelName,
            input: text,
            dimensions: this.modelName.includes("text-embedding-3") ? this.dimension : undefined,
        });
        return response.data[0].embedding;
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        // OpenAI batch limit logic (simplified for MVP)
        const response = await this.openai.embeddings.create({
            model: this.modelName,
            input: texts,
            dimensions: this.modelName.includes("text-embedding-3") ? this.dimension : undefined,
        });
        return response.data.map(d => d.embedding);
    }
}
