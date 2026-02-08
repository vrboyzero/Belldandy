import type { EmbeddingProvider, EmbeddingVector } from "./index.js";
export declare class OpenAIEmbeddingProvider implements EmbeddingProvider {
    private openai;
    readonly modelName: string;
    readonly dimension: number;
    constructor(options?: {
        apiKey?: string;
        baseURL?: string;
        model?: string;
        dimension?: number;
    });
    embed(text: string): Promise<EmbeddingVector>;
    embedQuery(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}
//# sourceMappingURL=openai.d.ts.map