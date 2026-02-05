import OpenAI from "openai";
import crypto from "node:crypto";
export const imageGenerateTool = {
    definition: {
        name: "image_generate",
        description: "Generate an image using DALL-E 3 based on a text prompt.",
        parameters: {
            type: "object",
            properties: {
                prompt: {
                    type: "string",
                    description: "The description of the image to generate.",
                },
                size: {
                    type: "string",
                    enum: ["1024x1024", "1024x1792", "1792x1024"],
                    description: "Resolution of the generated image (default: 1024x1024).",
                },
                quality: {
                    type: "string",
                    enum: ["standard", "hd"],
                    description: "Quality of the image (default: standard).",
                },
            },
            required: ["prompt"],
        },
    },
    async execute(args, context) {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "image_generate";
        // Check environment variables
        const apiKey = process.env.OPENAI_API_KEY;
        const baseURL = process.env.OPENAI_BASE_URL;
        if (!apiKey) {
            return {
                id,
                name,
                success: false,
                output: "Error: OPENAI_API_KEY not found in environment variables.",
                durationMs: Date.now() - start,
            };
        }
        try {
            const openai = new OpenAI({ apiKey, baseURL, timeout: 60000 }); // 60s timeout for image gen
            const response = await openai.images.generate({
                model: "dall-e-3",
                prompt: args.prompt,
                size: args.size || "1024x1024",
                quality: args.quality || "standard",
                n: 1,
            });
            const imageUrl = response.data?.[0]?.url;
            const revisedPrompt = response.data?.[0]?.revised_prompt;
            if (!imageUrl) {
                throw new Error("No image URL returned from API.");
            }
            const output = `![Generated Image](${imageUrl})\n\n*Revised Prompt*: ${revisedPrompt}`;
            return {
                id,
                name,
                success: true,
                output,
                durationMs: Date.now() - start,
            };
        }
        catch (err) {
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
//# sourceMappingURL=image.js.map