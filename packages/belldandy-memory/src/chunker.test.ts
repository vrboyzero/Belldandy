import { describe, it, expect } from "vitest";
import { Chunker } from "./chunker.js";

describe("Chunker", () => {
    it("should split by headers when content exceeds maxLength", () => {
        const content = `# Title
Section 1 content.

## Subtitle  
Section 2 content.`;
        // 每个 section 约 25-30 chars，设 maxLength=40 触发切分但不过度
        const chunker = new Chunker({ maxLength: 40, overlap: 0 });
        const chunks = chunker.splitText(content);

        // 期望切分成 2 个 chunks（按标题边界）
        expect(chunks.length).toBeGreaterThanOrEqual(2);
        expect(chunks[0]).toContain("# Title");
        // 最后一个 chunk 应该包含 Subtitle
        expect(chunks[chunks.length - 1]).toContain("Subtitle");
    });

    it("should merge short sections when within maxLength", () => {
        const content = `# Title
Short content.

## Subtitle
Also short.`;
        // maxLength 足够大，所有内容合并
        const chunker = new Chunker({ maxLength: 1000 });
        const chunks = chunker.splitText(content);

        expect(chunks.length).toBe(1);
        expect(chunks[0]).toContain("# Title");
        expect(chunks[0]).toContain("## Subtitle");
    });

    it("should force split long text without headers", () => {
        const chunker = new Chunker({ maxLength: 20, overlap: 0 });
        // 整个字符串约 40 chars，会被强制切分
        const content = "This is a long text that needs splitting.";

        const chunks = chunker.splitText(content);

        // 应该被切成多个 chunks
        expect(chunks.length).toBeGreaterThan(1);
        // 第一个 chunk 应该是 maxLength 长度
        expect(chunks[0].length).toBeLessThanOrEqual(20);
    });

    it("should merge short sections under maxLength", () => {
        const chunker = new Chunker({ maxLength: 100 });
        const content = `# Header

Short para 1.

Short para 2.`;
        // "Short para 1." + "Short para 2." should fit in 100 char chunk together with header
        const chunks = chunker.splitText(content);

        expect(chunks.length).toBe(1);
        expect(chunks[0]).toContain("Short para 1");
        expect(chunks[0]).toContain("Short para 2");
    });
});

