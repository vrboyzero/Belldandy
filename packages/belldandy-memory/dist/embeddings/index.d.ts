export type EmbeddingVector = number[];
export interface EmbeddingProvider {
    embed(text: string): Promise<EmbeddingVector>;
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
    readonly dimension?: number;
    readonly modelName?: string;
}
export type EmbeddingModel = EmbeddingProvider;
export declare function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
export declare function vectorToBuffer(vector: EmbeddingVector): Buffer;
export declare function vectorFromBuffer(buffer: Buffer): EmbeddingVector;
//# sourceMappingURL=index.d.ts.map