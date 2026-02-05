import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
// 跳过整个 describe 块，因为 vitest 不支持 node:sqlite
describe.skip("MemoryStore", () => {
    let store; // MemoryStore
    let dbPath;
    let MemoryStore;
    beforeEach(async () => {
        // 动态导入
        const mod = await import("./store.js");
        MemoryStore = mod.MemoryStore;
        dbPath = path.join(os.tmpdir(), `belldandy-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
        store = new MemoryStore(dbPath);
    });
    afterEach(() => {
        store.close();
        try {
            fs.unlinkSync(dbPath);
        }
        catch {
            // ignore
        }
    });
    describe("upsertChunk", () => {
        it("should insert a new chunk", () => {
            const chunk = {
                id: "test1",
                sourcePath: "/tmp/foo.txt",
                sourceType: "file",
                memoryType: "other",
                startLine: 1,
                endLine: 5,
                content: "This is a test content that should be indexed.",
                metadata: { foo: "bar" },
            };
            store.upsertChunk(chunk);
            const status = store.getStatus();
            expect(status.chunks).toBe(1);
            expect(status.files).toBe(1);
        });
        it("should update existing chunk", () => {
            const chunk = {
                id: "chunk_1",
                sourcePath: "docs/guide.md",
                sourceType: "file",
                memoryType: "other",
                content: "original content",
            };
            store.upsertChunk(chunk);
            store.upsertChunk({ ...chunk, content: "updated content" });
            const status = store.getStatus();
            expect(status.chunks).toBe(1);
        });
    });
    describe("searchKeyword", () => {
        beforeEach(() => {
            store.upsertChunk({
                id: "chunk_1",
                sourcePath: "docs/intro.md",
                sourceType: "file",
                content: "Belldandy 是一个本地优先的个人 AI 助手项目",
            });
            store.upsertChunk({
                id: "chunk_2",
                sourcePath: "docs/guide.md",
                sourceType: "file",
                content: "使用 WebChat 与助手对话，支持流式输出",
            });
            store.upsertChunk({
                id: "chunk_3",
                sourcePath: "memory/notes.md",
                sourceType: "file",
                content: "今天学习了 TypeScript 和 Node.js",
            });
        });
        it("should find chunks by keyword", () => {
            const results = store.searchKeyword("Belldandy");
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].sourcePath).toBe("docs/intro.md");
        });
        it("should find chunks by Chinese keyword", () => {
            const results = store.searchKeyword("助手");
            expect(results.length).toBe(2);
        });
        it("should return empty for no match", () => {
            const results = store.searchKeyword("不存在的关键词xyz");
            expect(results.length).toBe(0);
        });
        it("should limit results", () => {
            const results = store.searchKeyword("助手", 1);
            expect(results.length).toBe(1);
        });
        it("should return score in results", () => {
            const results = store.searchKeyword("Belldandy");
            expect(results[0].score).toBeGreaterThan(0);
            expect(results[0].score).toBeLessThanOrEqual(1);
        });
        it("should include snippet in results", () => {
            const results = store.searchKeyword("Belldandy");
            expect(results[0].snippet).toContain("Belldandy");
        });
    });
    describe("deleteBySource", () => {
        it("should delete chunks by source path", () => {
            store.upsertChunk({
                id: "chunk_1",
                sourcePath: "docs/old.md",
                sourceType: "file",
                content: "old content",
            });
            store.upsertChunk({
                id: "chunk_2",
                sourcePath: "docs/keep.md",
                sourceType: "file",
                content: "keep this",
            });
            const deleted = store.deleteBySource("docs/old.md");
            expect(deleted).toBe(1);
            expect(store.getStatus().chunks).toBe(1);
        });
    });
    describe("deleteAll", () => {
        it("should delete all chunks", () => {
            store.upsertChunk({
                id: "chunk_1",
                sourcePath: "a.md",
                sourceType: "file",
                content: "content a",
            });
            store.upsertChunk({
                id: "chunk_2",
                sourcePath: "b.md",
                sourceType: "file",
                content: "content b",
            });
            const deleted = store.deleteAll();
            expect(deleted).toBe(2);
            expect(store.getStatus().chunks).toBe(0);
        });
    });
    describe("getStatus", () => {
        it("should return correct counts", () => {
            store.upsertChunk({
                id: "chunk_1",
                sourcePath: "a.md",
                sourceType: "file",
                content: "content",
            });
            store.upsertChunk({
                id: "chunk_2",
                sourcePath: "a.md",
                sourceType: "file",
                content: "more content",
            });
            store.upsertChunk({
                id: "chunk_3",
                sourcePath: "b.md",
                sourceType: "file",
                content: "other file",
            });
            const status = store.getStatus();
            expect(status.chunks).toBe(3);
            expect(status.files).toBe(2);
        });
    });
    describe("updateLastIndexedAt", () => {
        it("should update last indexed timestamp", () => {
            store.updateLastIndexedAt();
            const status = store.getStatus();
            expect(status.lastIndexedAt).toBeDefined();
            expect(new Date(status.lastIndexedAt).getTime()).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=store.test.js.map