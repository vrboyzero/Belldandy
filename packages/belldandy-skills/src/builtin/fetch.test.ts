import { describe, it, expect } from "vitest";
import { fetchTool } from "./fetch.js";
import type { ToolContext } from "../types.js";

const baseContext: ToolContext = {
  conversationId: "test-conv",
  workspaceRoot: "/tmp/test",
  policy: {
    allowedPaths: [],
    deniedPaths: [],
    allowedDomains: [],
    deniedDomains: ["evil.com", "blocked.org"],
    maxTimeoutMs: 5000,
    maxResponseBytes: 1024,
  },
};

describe("web_fetch tool", () => {
  describe("security checks", () => {
    it("should block non-http protocols", async () => {
      const result = await fetchTool.execute({ url: "file:///etc/passwd" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("不支持的协议");
    });

    it("should block ftp protocol", async () => {
      const result = await fetchTool.execute({ url: "ftp://example.com/file" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("不支持的协议");
    });

    it("should block localhost", async () => {
      const result = await fetchTool.execute({ url: "http://localhost/admin" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("内网地址");
    });

    it("should block 127.0.0.1", async () => {
      const result = await fetchTool.execute({ url: "http://127.0.0.1:8080/api" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("内网地址");
    });

    it("should block 192.168.x.x", async () => {
      const result = await fetchTool.execute({ url: "http://192.168.1.1/admin" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("内网地址");
    });

    it("should block 10.x.x.x", async () => {
      const result = await fetchTool.execute({ url: "http://10.0.0.1/internal" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("内网地址");
    });

    it("should block 172.16-31.x.x", async () => {
      const result = await fetchTool.execute({ url: "http://172.16.0.1/private" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("内网地址");
    });

    it("should block denied domains", async () => {
      const result = await fetchTool.execute({ url: "https://evil.com/api" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("域名被禁止");
    });

    it("should block subdomains of denied domains", async () => {
      const result = await fetchTool.execute({ url: "https://api.evil.com/data" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("域名被禁止");
    });

    it("should enforce allowedDomains when configured", async () => {
      const restrictedContext: ToolContext = {
        ...baseContext,
        policy: {
          ...baseContext.policy,
          allowedDomains: ["example.com", "trusted.org"],
        },
      };

      const result = await fetchTool.execute(
        { url: "https://untrusted.com/api" },
        restrictedContext
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("不在白名单中");
    });
  });

  describe("input validation", () => {
    it("should reject empty url", async () => {
      const result = await fetchTool.execute({ url: "" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("非空字符串");
    });

    it("should reject invalid url", async () => {
      const result = await fetchTool.execute({ url: "not-a-valid-url" }, baseContext);
      expect(result.success).toBe(false);
      expect(result.error).toContain("无效的 URL");
    });

    it("should reject missing url", async () => {
      const result = await fetchTool.execute({}, baseContext);
      expect(result.success).toBe(false);
    });
  });

  describe("tool definition", () => {
    it("should have correct name and description", () => {
      expect(fetchTool.definition.name).toBe("web_fetch");
      expect(fetchTool.definition.description).toContain("HTTP");
    });

    it("should require url parameter", () => {
      expect(fetchTool.definition.parameters.required).toContain("url");
    });

    it("should support GET and POST methods", () => {
      const methodParam = fetchTool.definition.parameters.properties.method;
      expect(methodParam.enum).toContain("GET");
      expect(methodParam.enum).toContain("POST");
    });
  });
});
