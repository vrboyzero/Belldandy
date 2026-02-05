import type { Tool } from "../types.js";
export declare const memorySearchTool: Tool;
export declare const memoryIndexTool: Tool;
export type MemorySearchToolConfig = {
    storePath?: string;
};
export declare function createMemorySearchTool(config?: MemorySearchToolConfig): Tool;
export declare function createMemoryGetTool(): Tool;
//# sourceMappingURL=memory.d.ts.map