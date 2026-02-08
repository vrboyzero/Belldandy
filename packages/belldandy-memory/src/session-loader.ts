import fs from "node:fs/promises";

/**
 * Extract text content from a session JSONL file
 * Formats data as:
 * User: ...
 * Assistant: ...
 */
export async function extractTextFromSession(filePath: string): Promise<string> {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n").filter(line => line.trim());
        const blocks: string[] = [];

        for (const line of lines) {
            try {
                const msg = JSON.parse(line);
                if (msg.role && msg.content) {
                    const roleName = msg.role === "user" ? "User" : "Assistant";
                    blocks.push(`${roleName}: ${msg.content}`);
                }
            } catch {
                // ignore
            }
        }

        return blocks.join("\n\n");
    } catch (err) {
        console.warn(`Failed to extract text from session ${filePath}`, err);
        return "";
    }
}
