
import { OpenAIChatAgent } from "../packages/belldandy-agent/src/openai.js";
import path from "path";
import * as url from 'url';
import * as fs from 'fs';

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));
// dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Mock fetch globally
const originalFetch = global.fetch;
global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = url.toString();
    console.log(`\n[MockFetch] Request to: ${urlStr}`);

    if (urlStr.includes("/files") && init?.method === "POST") {
        console.log("[MockFetch] Intercepted File Upload");
        // Verify headers and body if needed
        return new Response(JSON.stringify({ id: "file-dummy-123" }), { status: 200 });
    }

    if (urlStr.includes("/chat/completions") && init?.method === "POST") {
        console.log("[MockFetch] Intercepted Chat Completion");
        const body = JSON.parse(init.body as string);
        console.log("[MockFetch] Request Body:", JSON.stringify(body, null, 2));

        // Check if video_file is present in messages
        const userMsg = body.messages.find((m: any) => m.role === "user");
        if (userMsg && Array.isArray(userMsg.content)) {
            const videoPart = userMsg.content.find((p: any) => p.type === "video_file");
            if (videoPart && videoPart.video_file?.file_id === "file-dummy-123") {
                console.log("[MockFetch] SUCCESS: Found video_file with correct file_id!");
            } else {
                console.error("[MockFetch] FAILURE: video_file missing or incorrect id", videoPart);
            }
        }

        // Return a dummy completion
        return new Response(JSON.stringify({
            id: "chatcmpl-123",
            object: "chat.completion",
            created: Date.now(),
            model: "kimi-k2.5-preview",
            choices: [{
                index: 0,
                message: {
                    role: "assistant",
                    content: "I see a big buck bunny in the video. It seems to be a test video."
                },
                finish_reason: "stop"
            }],
            usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
        }), { status: 200 });
    }

    // Fallback for other requests (if any)
    // return originalFetch(url, init);
    return new Response("Not Found", { status: 404 });
}) as any;

const apiKey = "dummy-api-key";
const baseUrl = "https://api.moonshot.cn/v1";

async function main() {
    console.log("Starting Kimi Video Verification (Mocked)...");

    // Create OpenAIChatAgent with dummy config
    // Note: OpenAIChatAgent constructor might check types, but apiKey is string
    const agent = new OpenAIChatAgent({
        apiKey,
        baseUrl,
        model: "kimi-k2.5-preview",
        stream: false,
        timeoutMs: 5000
    });

    const videoPath = path.resolve(__dirname, "../sample.mp4");
    console.log(`Testing with video: ${videoPath}`);

    // Ensure sample.mp4 exists
    if (!fs.existsSync(videoPath)) {
        fs.writeFileSync(videoPath, "dummy video content");
    }

    const input = {
        conversationId: "test-video-" + Date.now(),
        text: "",
        content: [
            { type: "text", text: "What is happening in this video?" },
            { type: "video_url", video_url: { url: `file://${videoPath}` } }
        ]
    };

    try {
        const stream = agent.run(input as any);

        for await (const item of stream) {
            if (item.type === "final") {
                console.log("\n--- Final Response ---");
                console.log(item.text);
            } else if (item.type === "status") {
                console.log(`[Status] ${item.status}`);
            }
        }
        console.log("\nVerification PASSED if you saw SUCCESS above.");
    } catch (error) {
        console.error("Test Failed:", error);
    }
}

main();
