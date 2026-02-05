import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
// import { MemoryStore } from "./store.js"; // 静态导入会导致 vitest 解析 node:sqlite
// import { MemoryIndexer } from "./indexer.js";
// Mock fs and MemoryStore
vi.mock("node:fs/promises");
// vi.mock("./store.js"); // 不再使用，因为 describe.skip 会跳过整个测试
// NOTE: 这些测试依赖 MemoryStore，而 MemoryStore 使用 node:sqlite
// vitest/vite 目前无法正确解析 node:sqlite 模块，所以跳过这些测试
describe.skip("MemoryIndexer", () => {
    let store; // MemoryStore
    let indexer; // MemoryIndexer
    let MemoryStore;
    let MemoryIndexer;
    beforeEach(async () => {
        // 动态导入以避免 vitest 解析 node:sqlite
        const storeMod = await import("./store.js");
        const indexerMod = await import("./indexer.js");
        MemoryStore = storeMod.MemoryStore;
        MemoryIndexer = indexerMod.MemoryIndexer;
        store = new MemoryStore(":memory:");
        indexer = new MemoryIndexer(store);
    });
    afterEach(() => {
        vi.clearAllMocks();
    });
    it("should index a file", async () => {
        // Setup mocks
        const statMock = {
            isFile: () => true,
            isDirectory: () => false,
            mtime: new Date("2024-01-01T00:00:00Z"),
        };
        vi.mocked(fs.stat).mockResolvedValue(statMock);
        vi.mocked(fs.readFile).mockResolvedValue("# Test Content");
        // Mock store methods
        store.getFileMetadata = vi.fn().mockReturnValue(null); // No existing metadata
        store.deleteBySource = vi.fn();
        store.upsertChunk = vi.fn();
        store.updateLastIndexedAt = vi.fn();
        await indexer.indexFile("test.md");
        expect(fs.readFile).toHaveBeenCalledWith("test.md", "utf-8");
        expect(store.deleteBySource).toHaveBeenCalledWith("test.md");
        expect(store.upsertChunk).toHaveBeenCalled();
    });
    it("should skip if file not changed", async () => {
        // Setup mocks
        const mtime = new Date("2024-01-01T00:00:00Z");
        const statMock = {
            isFile: () => true,
            mtime: mtime,
        };
        vi.mocked(fs.stat).mockResolvedValue(statMock);
        // Existing metadata matches mtime
        store.getFileMetadata = vi.fn().mockReturnValue({
            updatedAt: "2024-01-02", // Store record time
            metadata: { file_mtime: mtime.toISOString() }
        });
        await indexer.indexFile("test.md");
        // Should NOT read file or update store
        expect(fs.readFile).not.toHaveBeenCalled();
        expect(store.upsertChunk).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=indexer.test.js.map