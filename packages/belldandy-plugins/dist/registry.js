import path from "node:path";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
export class PluginRegistry {
    plugins = new Map();
    tools = new Map();
    hooksList = [];
    /**
     * Load a plugin from a file path.
     * The file must default export an object implementing BelldandyPlugin.
     */
    async loadPlugin(filePath) {
        try {
            // Dynamic import requires file URL
            const fileUrl = pathToFileURL(path.resolve(filePath)).href;
            const mod = await import(fileUrl);
            const plugin = mod.default;
            if (!plugin || typeof plugin.activate !== "function") {
                throw new Error(`Plugin at ${filePath} does not export a valid BelldandyPlugin (missing activate function)`);
            }
            if (this.plugins.has(plugin.id)) {
                console.warn(`Plugin ${plugin.id} is already loaded. Skipping ${filePath}.`);
                return;
            }
            console.log(`Loading plugin: ${plugin.name} (${plugin.id})`);
            const context = {
                registerTool: (tool) => {
                    if (this.tools.has(tool.definition.name)) {
                        console.warn(`Plugin ${plugin.id} registered duplicate tool: ${tool.definition.name}`);
                    }
                    this.tools.set(tool.definition.name, tool);
                },
                registerHooks: (hooks) => {
                    this.hooksList.push(hooks);
                }
            };
            await plugin.activate(context);
            this.plugins.set(plugin.id, plugin);
        }
        catch (err) {
            console.error(`Failed to load plugin from ${filePath}:`, err);
            throw err;
        }
    }
    /**
     * Load all plugins from a directory (non-recursive)
     */
    async loadPluginDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
                    await this.loadPlugin(path.join(dirPath, entry.name));
                }
            }
        }
        catch (err) {
            console.error(`Failed to load plugins from directory ${dirPath}:`, err);
        }
    }
    /**
     * Get all registered tools
     */
    getAllTools() {
        return Array.from(this.tools.values());
    }
    /**
     * Get aggregated hooks to pass to the Agent
     */
    getAggregatedHooks() {
        return {
            beforeRun: async (evt, ctx) => {
                for (const h of this.hooksList) {
                    if (h.beforeRun) {
                        const res = await h.beforeRun(evt, ctx);
                        if (res && typeof res === "object") {
                            evt.input = { ...evt.input, ...res };
                        }
                    }
                }
            },
            afterRun: async (evt, ctx) => {
                for (const h of this.hooksList) {
                    if (h.afterRun)
                        await h.afterRun(evt, ctx);
                }
            },
            beforeToolCall: async (evt, ctx) => {
                for (const h of this.hooksList) {
                    if (h.beforeToolCall) {
                        const result = await h.beforeToolCall(evt, ctx);
                        if (result === false)
                            return false; // Block execution
                        if (typeof result === "object") {
                            // Merge argument overrides
                            evt.arguments = { ...evt.arguments, ...result };
                        }
                    }
                }
            },
            afterToolCall: async (evt, ctx) => {
                for (const h of this.hooksList) {
                    if (h.afterToolCall)
                        await h.afterToolCall(evt, ctx);
                }
            }
        };
    }
}
//# sourceMappingURL=registry.js.map