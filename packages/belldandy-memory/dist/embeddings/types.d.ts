/**
 * Embedding 向量表示
 */
export type EmbeddingVector = number[];
/**
 * 单个 embedding 结果
 */
export type EmbeddingResult = {
    /** 原始文本 */
    text: string;
    /** 向量表示 */
    embedding: EmbeddingVector;
    /** 向量维度 */
    dimensions: number;
    /** 使用的模型 */
    model: string;
};
/**
 * 批量 embedding 请求
 */
export type EmbeddingRequest = {
    /** 要嵌入的文本列表 */
    texts: string[];
};
/**
 * 批量 embedding 响应
 */
export type EmbeddingResponse = {
    /** 嵌入结果列表（与输入顺序对应） */
    embeddings: EmbeddingResult[];
    /** 使用的 provider */
    provider: string;
    /** 使用的模型 */
    model: string;
    /** 总 token 使用量（如果可用） */
    totalTokens?: number;
};
/**
 * Embedding Provider 配置
 */
export type EmbeddingProviderConfig = {
    /** API 端点 */
    baseUrl?: string;
    /** API 密钥 */
    apiKey?: string;
    /** 模型名称 */
    model?: string;
    /** 请求超时（毫秒） */
    timeoutMs?: number;
    /** 额外 headers */
    headers?: Record<string, string>;
};
/**
 * Embedding Provider 接口
 *
 * 所有 embedding 提供者必须实现此接口。
 */
export interface EmbeddingProvider {
    /** Provider 名称 */
    readonly name: string;
    /** 默认模型 */
    readonly defaultModel: string;
    /** 向量维度 */
    readonly dimensions: number;
    /**
     * 生成单个文本的 embedding
     */
    embed(text: string): Promise<EmbeddingResult>;
    /**
     * 批量生成 embedding
     */
    embedBatch(request: EmbeddingRequest): Promise<EmbeddingResponse>;
    /**
     * 计算两个向量的余弦相似度
     */
    cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
}
/**
 * 计算余弦相似度（通用实现）
 */
export declare function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number;
/**
 * 将向量序列化为 JSON 字符串（用于存储）
 */
export declare function vectorToJson(embedding: EmbeddingVector): string;
/**
 * 从 JSON 字符串反序列化向量
 */
export declare function vectorFromJson(json: string): EmbeddingVector;
/**
 * 将向量转换为 Float32Array（用于高效存储）
 */
export declare function vectorToFloat32(embedding: EmbeddingVector): Float32Array;
/**
 * 从 Float32Array 恢复向量
 */
export declare function vectorFromFloat32(buffer: Float32Array): EmbeddingVector;
/**
 * 将向量转换为 Buffer（用于 SQLite blob 存储）
 */
export declare function vectorToBuffer(embedding: EmbeddingVector): Buffer;
/**
 * 从 Buffer 恢复向量
 */
export declare function vectorFromBuffer(buffer: Buffer): EmbeddingVector;
//# sourceMappingURL=types.d.ts.map