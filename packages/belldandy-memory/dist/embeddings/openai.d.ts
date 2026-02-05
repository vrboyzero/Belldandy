import type { EmbeddingModel, EmbeddingVector } from "./index.js";
export declare class OpenAIEmbeddingProvider implements EmbeddingModel {
    private openai;
    readonly modelName: string;
    readonly dimension: number;
    constructor(options?: {
        apiKey?: string;
        baseURL?: string;
        model?: string;
        dimension?: number;
    });
    embedQuery(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}
//# sourceMappingURL=openai.d.ts.map