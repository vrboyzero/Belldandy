import type { Tool, ToolCallResult } from "../../types.js";
import OpenAI from "openai";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { EdgeTTS } from "node-edge-tts";

export const textToSpeechTool: Tool = {
    definition: {
        name: "text_to_speech",
        description: "Convert text to spoken audio using OpenAI TTS or Edge TTS (Free).",
        parameters: {
            type: "object",
            properties: {
                input: {
                    type: "string",
                    description: "The text to generate audio for.",
                },
                provider: {
                    type: "string",
                    enum: ["openai", "edge"],
                    description: "TTS Provider: 'openai' (paid) or 'edge' (free). Default: 'edge'.",
                },
                voice: {
                    type: "string",
                    description: "Voice ID. OpenAI: 'alloy', 'echo'. Edge: 'zh-CN-XiaoxiaoNeural', 'en-US-AriaNeural'. Default: Auto-selects based on provider.",
                },
                model: {
                    type: "string",
                    enum: ["tts-1", "tts-1-hd"],
                    description: "OpenAI model to use (default: tts-1). Ignored for Edge.",
                },
            },
            required: ["input"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "text_to_speech";

        const provider = (args.provider as string) || "edge";
        const input = args.input as string;

        // Define active voice
        let voice = args.voice as string | undefined;
        if (!voice) {
            voice = provider === "openai" ? "alloy" : "zh-CN-XiaoxiaoNeural";
        }

        try {
            const generatedDir = path.join(context.workspaceRoot, ".belldandy", "generated");
            await fs.mkdir(generatedDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `speech-${timestamp}.mp3`;
            const filepath = path.join(generatedDir, filename);

            if (provider === "openai") {
                const apiKey = process.env.OPENAI_API_KEY;
                const baseURL = process.env.OPENAI_BASE_URL;

                if (!apiKey) throw new Error("OPENAI_API_KEY required for OpenAI provider.");

                const openai = new OpenAI({ apiKey, baseURL });
                const mp3 = await openai.audio.speech.create({
                    model: (args.model as any) || "tts-1",
                    voice: voice as any,
                    input: input,
                });
                const buffer = Buffer.from(await mp3.arrayBuffer());
                await fs.writeFile(filepath, buffer);

            } else {
                // Edge TTS
                const tts = new EdgeTTS({
                    voice: voice,
                });
                await tts.ttsPromise(input, filepath);
            }

            // Return relative path for web access (served by Gateway static /generated)
            const webPath = `/generated/${filename}`;
            const htmlAudio = `<audio controls src="${webPath}" preload="metadata"></audio>`;

            return {
                id,
                name,
                success: true,
                output: `Audio generated (${provider} - ${voice}):\n\n${htmlAudio}\n[Download](${webPath})`,
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return {
                id,
                name,
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};
