/**
 * 计算余弦相似度（通用实现）
 */
export function cosineSimilarity(a, b) {
    if (a.length === 0 || b.length === 0)
        return 0;
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
    if (normA === 0 || normB === 0)
        return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
/**
 * 将向量序列化为 JSON 字符串（用于存储）
 */
export function vectorToJson(embedding) {
    return JSON.stringify(embedding);
}
/**
 * 从 JSON 字符串反序列化向量
 */
export function vectorFromJson(json) {
    try {
        const parsed = JSON.parse(json);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
/**
 * 将向量转换为 Float32Array（用于高效存储）
 */
export function vectorToFloat32(embedding) {
    return new Float32Array(embedding);
}
/**
 * 从 Float32Array 恢复向量
 */
export function vectorFromFloat32(buffer) {
    return Array.from(buffer);
}
/**
 * 将向量转换为 Buffer（用于 SQLite blob 存储）
 */
export function vectorToBuffer(embedding) {
    return Buffer.from(new Float32Array(embedding).buffer);
}
/**
 * 从 Buffer 恢复向量
 */
export function vectorFromBuffer(buffer) {
    const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    return Array.from(float32);
}
//# sourceMappingURL=types.js.map