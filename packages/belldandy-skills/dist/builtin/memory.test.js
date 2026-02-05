import { describe, it } from "vitest";
// NOTE: 这些测试跳过因为 vitest 不支持 node:sqlite
// @belldandy/memory 依赖 node:sqlite，导致 vitest 无法加载
// 代码通过独立脚本和端到端测试验证可用
describe("memory_search tool", () => {
    it.skip("should return search results", () => {
        // See note above
    });
    it.skip("should handle empty results", () => {
        // See note above
    });
    it.skip("should handle error", () => {
        // See note above
    });
});
describe("memory_get tool", () => {
    it.skip("should read memory file content", () => {
        // See note above
    });
    it.skip("should handle line range", () => {
        // See note above
    });
    it.skip("should reject non-memory paths", () => {
        // See note above
    });
});
//# sourceMappingURL=memory.test.js.map