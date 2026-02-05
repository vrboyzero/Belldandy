export function cosineSimilarity(a, b) {
    if (a.length !== b.length)
        return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
export function vectorToBuffer(vector) {
    return Buffer.from(new Float32Array(vector).buffer);
}
export function vectorFromBuffer(buffer) {
    return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4));
}
//# sourceMappingURL=index.js.map