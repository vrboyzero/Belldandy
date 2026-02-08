import puppeteer, { Browser, Page } from "puppeteer-core";
import { Tool, ToolContext, ToolCallResult } from "../../types.js";
import path from "node:path";
import fs from "node:fs/promises";

// Relay Server runs on port 28892 by default
const RELAY_WS_ENDPOINT = "ws://127.0.0.1:28892/cdp";

import { SNAPSHOT_SCRIPT } from "./snapshot.js";

// [SECURITY] 域名控制（双模式）
const ALLOWED_DOMAINS_RAW = process.env.BELLDANDY_BROWSER_ALLOWED_DOMAINS;
const DENIED_DOMAINS_RAW = process.env.BELLDANDY_BROWSER_DENIED_DOMAINS;
const ALLOWED_DOMAINS = ALLOWED_DOMAINS_RAW?.split(",").map(d => d.trim().toLowerCase()).filter(Boolean) || [];
const DENIED_DOMAINS = DENIED_DOMAINS_RAW?.split(",").map(d => d.trim().toLowerCase()).filter(Boolean) || [];

function validateBrowserUrl(urlStr: string): { ok: true } | { ok: false; error: string } {
    let url: URL;
    try {
        url = new URL(urlStr);
    } catch {
        return { ok: false, error: `无效的 URL: ${urlStr}` };
    }

    const hostname = url.hostname.toLowerCase();

    // 黑名单检查（优先级最高）
    if (DENIED_DOMAINS.length > 0) {
        const denied = DENIED_DOMAINS.find(d => hostname === d || hostname.endsWith(`.${d}`));
        if (denied) {
            return { ok: false, error: `域名被禁止: ${hostname}` };
        }
    }

    // 白名单检查（仅在配置了白名单时生效）
    if (ALLOWED_DOMAINS.length > 0) {
        const allowed = ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
        if (!allowed) {
            return { ok: false, error: `域名不在白名单中: ${hostname}` };
        }
    }

    return { ok: true };
}

class BrowserManager {
    private static instance: BrowserManager;
    private browser: Browser | null = null;
    private connecting = false;

    private constructor() { }

    public static getInstance(): BrowserManager {
        if (!BrowserManager.instance) {
            BrowserManager.instance = new BrowserManager();
        }
        return BrowserManager.instance;
    }

    public async connect(): Promise<Browser> {
        if (this.browser && this.browser.isConnected()) {
            return this.browser;
        }

        if (this.connecting) {
            // Wait for existing connection attempt
            while (this.connecting) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this.browser && this.browser.isConnected()) {
                return this.browser;
            }
        }

        this.connecting = true;
        try {
            // Connect to Belldandy Relay
            this.browser = await puppeteer.connect({
                browserWSEndpoint: RELAY_WS_ENDPOINT,
                defaultViewport: null, // Let browser handle viewport
            });
            console.log("[BrowserManager] Connected to Relay");

            this.browser.on("disconnected", () => {
                console.warn("[BrowserManager] Browser disconnected");
                this.browser = null;
            });

            return this.browser;
        } finally {
            this.connecting = false;
        }
    }

    public async getPage(): Promise<Page> {
        const browser = await this.connect();
        let pages = await browser.pages();

        // Puppeteer via Relay should find the targets exposed by Relay.
        // If we have open pages, pick the first visible one (usually the active tab user is on).
        if (pages.length > 0) {
            return pages[0];
        }

        console.log("[BrowserManager] Waiting for targets...");
        try {
            const target = await browser.waitForTarget(t => t.type() === 'page', { timeout: 5000 });
            const page = await target.page();
            if (!page) throw new Error("Target found but no page attached");
            return page;
        } catch (err) {
            const targets = browser.targets();
            const targetDebug = targets.map(t => ({
                type: t.type(),
                url: t.url(),
                isPage: t.type() === 'page'
            }));
            console.warn("[BrowserManager] No pages found after wait. Available targets:", JSON.stringify(targetDebug, null, 2));

            throw new Error("No pages found. Ensure the Browser Extension is connected to the Relay.");
        }
    }

    public async close() {
        if (this.browser) {
            await this.browser.disconnect();
            this.browser = null;
        }
    }
}

// Helper to standardise tool results
const success = (id: string, name: string, output: string, start: number): ToolCallResult => ({
    id,
    name,
    success: true,
    output,
    durationMs: Date.now() - start,
});

const failure = (id: string, name: string, error: unknown, start: number): ToolCallResult => ({
    id,
    name,
    success: false,
    output: "",
    error: error instanceof Error ? error.message : String(error),
    durationMs: Date.now() - start,
});

// --- Tools ---

export const browserOpenTool: Tool = {
    definition: {
        name: "browser_open",
        description: "Open the browser (connect if needed) and navigate to a URL. Use this to start a browsing session.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL to navigate to." },
            },
            required: ["url"],
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const url = args.url as string;

            // [SECURITY] 域名校验
            const validation = validateBrowserUrl(url);
            if (!validation.ok) {
                return failure("unknown", "browser_open", validation.error, start);
            }

            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();

            // Navigate
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

            return success(
                "unknown", // ID injected by executor usually
                "browser_open",
                `Opened browser and navigated to ${url}`,
                start
            );
        } catch (err) {
            return failure("unknown", "browser_open", err, start);
        }
    },
};

export const browserNavigateTool: Tool = {
    definition: {
        name: "browser_navigate",
        description: "Navigate the active tab to a new URL.",
        parameters: {
            type: "object",
            properties: {
                url: { type: "string", description: "The URL to navigate to." },
            },
            required: ["url"],
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const url = args.url as string;

            // [SECURITY] 域名校验
            const validation = validateBrowserUrl(url);
            if (!validation.ok) {
                return failure("unknown", "browser_navigate", validation.error, start);
            }

            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();

            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

            return success("unknown", "browser_navigate", `Navigated to ${url}`, start);
        } catch (err) {
            return failure("unknown", "browser_navigate", err, start);
        }
    },
};

export const browserClickTool: Tool = {
    definition: {
        name: "browser_click",
        description: "Click an element on the active page matched by a CSS selector OR a Snapshot ID.",
        parameters: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector for the element to click." },
                id: { type: "number", description: "The numeric ID from browser_snapshot (e.g. 42)." },
            },
            oneOf: [{ required: ["selector"] }, { required: ["id"] }],
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const { selector, id } = args as { selector?: string; id?: number };
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();

            let targetSelector = selector;
            if (id !== undefined) {
                targetSelector = `[data-agent-id="${id}"]`;
            }

            if (!targetSelector) throw new Error("Either selector or id must be provided");

            await page.waitForSelector(targetSelector, { timeout: 5000 });
            await page.click(targetSelector);

            return success("unknown", "browser_click", `Clicked element: ${targetSelector}`, start);
        } catch (err) {
            return failure("unknown", "browser_click", err, start);
        }
    },
};

export const browserTypeTool: Tool = {
    definition: {
        name: "browser_type",
        description: "Type text into an element on the active page matched by a CSS selector OR a Snapshot ID.",
        parameters: {
            type: "object",
            properties: {
                selector: { type: "string", description: "CSS selector for the input element." },
                id: { type: "number", description: "The numeric ID from browser_snapshot (e.g. 42)." },
                text: { type: "string", description: "The text to type." },
            },
            required: ["text"],
            oneOf: [{ required: ["selector"] }, { required: ["id"] }],
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const { selector, id, text } = args as { selector?: string; id?: number; text: string };
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();

            let targetSelector = selector;
            if (id !== undefined) {
                targetSelector = `[data-agent-id="${id}"]`;
            }

            if (!targetSelector) throw new Error("Either selector or id must be provided");

            await page.waitForSelector(targetSelector, { timeout: 5000 });
            await page.type(targetSelector, text);

            return success("unknown", "browser_type", `Typed "${text}" into ${targetSelector}`, start);
        } catch (err) {
            return failure("unknown", "browser_type", err, start);
        }
    },
};

export const browserScreenshotTool: Tool = {
    definition: {
        name: "browser_screenshot",
        description: "Capture a screenshot of the active page.",
        parameters: {
            type: "object",
            properties: {
                name: { type: "string", description: "Optional name for the screenshot file (without extension)." },
            },
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const name = (args.name as string) || `screenshot-${Date.now()}`;
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();

            // Ensure workspace screenshots directory exists (optional, or just save to root)
            // For now, save to workspace root or a dedicated 'screenshots' folder?
            // Let's use request workspaceRoot if available, or cwd.
            const targetDir = context.workspaceRoot || ".";
            const filename = `${name}.png`;
            const filepath = path.join(targetDir, filename);

            await page.screenshot({ path: filepath });

            return success("unknown", "browser_screenshot", `Screenshot saved to ${filepath}`, start);
        } catch (err) {
            return failure("unknown", "browser_screenshot", err, start);
        }
    },
};

export const browserGetContentTool: Tool = {
    definition: {
        name: "browser_get_content",
        description: "Get the text content or HTML of the active page.",
        parameters: {
            type: "object",
            properties: {
                format: { type: "string", description: "'text' or 'html'. Default is 'text'.", enum: ["text", "html"] },
            },
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const format = (args.format as string) || "text";
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();

            let content = "";
            if (format === "html") {
                content = await page.content();
            } else {
                // Get generic text content (e.g. body.innerText)
                content = await page.evaluate(() => document.body.innerText);
            }

            // Truncate if too long? For now, return full content (tool policy might cap it later).
            // Let's truncate to reasonable size for LLM consumption (e.g. 10k chars)
            const MAX_LEN = 10000;
            const truncated = content.length > MAX_LEN
                ? content.slice(0, MAX_LEN) + `\n...[truncated ${content.length - MAX_LEN} chars]...`
                : content;

            return success("unknown", "browser_get_content", truncated, start);
        } catch (err) {
            return failure("unknown", "browser_get_content", err, start);
        }
    },
};

export const browserSnapshotTool: Tool = {
    definition: {
        name: "browser_snapshot",
        description: "Capture an interactive DOM snapshot of the active page. This returns a compressed text representation of the page, filtering out noise and assigning numeric IDs (e.g. [42]) to interactive elements.",
        parameters: {
            type: "object",
            properties: {},
        },
    },
    execute: async (args, context) => {
        const start = Date.now();
        try {
            const manager = BrowserManager.getInstance();
            const page = await manager.getPage();

            // Inject and execute the snapshot script
            const snapshot = await page.evaluate((script) => {
                // Execute the script string
                return eval(script);
            }, SNAPSHOT_SCRIPT);

            return success("unknown", "browser_snapshot", String(snapshot), start);
        } catch (err) {
            return failure("unknown", "browser_snapshot", err, start);
        }
    },
};
