import type { Tool, ToolCallResult } from "../types.js";
import { MemoryManager } from "@belldandy/memory";
import type { MemorySearchResult, MemoryIndexStatus } from "@belldandy/memory";
import path from "node:path";

// Singleton instance (lazy init)
let memoryManager: MemoryManager | null = null;

function getMemoryManager(workspaceRoot: string): MemoryManager {
    if (!memoryManager) {
        memoryManager = new MemoryManager({
            workspaceRoot,
            // API key is pulled from env by MemoryManager default behavior
        });
    }
    return memoryManager;
}

export const memorySearchTool: Tool = {
    definition: {
        name: "memory_search",
        description: "Search the knowledge base (files in workspace) using hybrid retrieval (semantic vector search + keyword search). Use this to find information, code snippets, or context from the project.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "The search query (natural language or keywords).",
                },
                limit: {
                    type: "number",
                    description: "Max number of results to return (default: 5).",
                },
            },
            required: ["query"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            const query = args.query as string;
            const limit = (args.limit as number) || 5;

            const results = await manager.search(query, limit);

            // Format results
            const output = results.map(r =>
                `[${r.sourcePath}:${r.startLine || 0}] (Score: ${r.score.toFixed(3)})\n${r.snippet}`
            ).join("\n\n---\n\n");

            return {
                id: "memory_search",
                name: "memory_search",
                success: true,
                output: output || "No relevant results found.",
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return {
                id: "memory_search",
                name: "memory_search",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

export const memoryIndexTool: Tool = {
    definition: {
        name: "memory_index",
        description: "Trigger a re-index of the workspace files into the memory. Use this after significant file changes or manually.",
        parameters: {
            type: "object",
            properties: {},
        },
    },

    async execute(_args, context): Promise<ToolCallResult> {
        const start = Date.now();
        try {
            const manager = getMemoryManager(context.workspaceRoot);
            await manager.indexWorkspace();
            const status = manager.getStatus();

            return {
                id: "memory_index",
                name: "memory_index",
                success: true,
                output: `Indexing completed. Files: ${status.files}, Chunks: ${status.chunks}, Vectors: ${status.vectorIndexed || 0}, Cached: ${status.vectorCached || 0}`,
                durationMs: Date.now() - start,
            };

        } catch (err) {
            return {
                id: "memory_index",
                name: "memory_index",
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};

// ============================================================================
// Legacy / Compatibility Exports
// ============================================================================

export type MemorySearchToolConfig = {
    // Configuration properties if needed for backward compatibility
    storePath?: string;
};

export function createMemorySearchTool(config?: MemorySearchToolConfig): Tool {
    // In the new singleton architecture, config is handled by the environment/defaults
    // or we could pass config to the first getMemoryManager call if not initialized.
    // For now, return the singleton tool.
    return memorySearchTool;
}

export function createMemoryGetTool(): Tool {
    return {
        definition: {
            name: "memory_get",
            description: "[Deprecated] Retrieve raw memory/file content. Please use 'file_read' or 'memory_search' instead.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "Path to the file or memory item to retrieve."
                    }
                },
                required: ["path"]
            },
        },
        async execute(args, context): Promise<ToolCallResult> {
            return {
                id: "memory_get",
                name: "memory_get",
                success: false,
                output: "",
                error: "This tool is deprecated. Please use 'file_read' to read files or 'memory_search' to find content.",
                durationMs: 0
            };
        }
    };
}
