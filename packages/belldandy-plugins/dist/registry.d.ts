import type { Tool } from "@belldandy/skills";
import type { AgentHooks } from "@belldandy/agent";
export declare class PluginRegistry {
    private plugins;
    private tools;
    private hooksList;
    /**
     * Load a plugin from a file path.
     * The file must default export an object implementing BelldandyPlugin.
     */
    loadPlugin(filePath: string): Promise<void>;
    /**
     * Load all plugins from a directory (non-recursive)
     */
    loadPluginDirectory(dirPath: string): Promise<void>;
    /**
     * Get all registered tools
     */
    getAllTools(): Tool[];
    /**
     * Get aggregated hooks to pass to the Agent
     */
    getAggregatedHooks(): AgentHooks;
}
//# sourceMappingURL=registry.d.ts.map