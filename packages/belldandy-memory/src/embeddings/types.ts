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
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
    if (a.length === 0 || b.length === 0) return 0;
    const len = Math.min(a.length, b.length);
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < len; i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 将向量序列化为 JSON 字符串（用于存储）
 */
export function vectorToJson(embedding: EmbeddingVector): string {
    return JSON.stringify(embedding);
}

/**
 * 从 JSON 字符串反序列化向量
 */
export function vectorFromJson(json: string): EmbeddingVector {
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * 将向量转换为 Float32Array（用于高效存储）
 */
export function vectorToFloat32(embedding: EmbeddingVector): Float32Array {
    return new Float32Array(embedding);
}

/**
 * 从 Float32Array 恢复向量
 */
export function vectorFromFloat32(buffer: Float32Array): EmbeddingVector {
    return Array.from(buffer);
}

/**
 * 将向量转换为 Buffer（用于 SQLite blob 存储）
 */
export function vectorToBuffer(embedding: EmbeddingVector): Buffer {
    return Buffer.from(new Float32Array(embedding).buffer);
}

/**
 * 从 Buffer 恢复向量
 */
export function vectorFromBuffer(buffer: Buffer): EmbeddingVector {
    const float32 = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 4,
    );
    return Array.from(float32);
}
