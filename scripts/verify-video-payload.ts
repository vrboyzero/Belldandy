import { OpenAIChatAgent } from "../packages/belldandy-agent/src/index.js";
import * as path from "path";
import * as fs from "fs";

// Mock env
process.env.BELLDANDY_OPENAI_API_KEY = "sk-mock-key";
process.env.BELLDANDY_OPENAI_BASE_URL = "https://api.moonshot.cn/v1";
process.env.BELLDANDY_MODEL = "moonshot-v1-8k";

async function main() {
    console.log("Starting video payload verification...");

    // Create a dummy video file
    const videoPath = path.resolve("temp_video.mp4");
    fs.writeFileSync(videoPath, "fake video content");

    const agent = new OpenAIChatAgent({
        apiKey: process.env.BELLDANDY_OPENAI_API_KEY!,
        baseUrl: process.env.BELLDANDY_OPENAI_BASE_URL!,
        model: process.env.BELLDANDY_MODEL!,
        stream: false
    });

    const input = {
        conversationId: "test-conv",
        history: [],
        content: [
            { type: "text", text: "Analyze this video" },
            { type: "video_url", video_url: { url: `file://${videoPath}` } }
        ]
    };

    // We expect this to fail at network level, but we just want to see the logs
    try {
        const generator = agent.run(input as any); // Type assertion for test
        for await (const chunk of generator) {
            console.log("Chunk:", chunk);
        }
    } catch (error: any) {
        console.log("Expected error (network):", error.message);
    }

    // Cleanup
    fs.unlinkSync(videoPath);
}

main().catch(console.error);
