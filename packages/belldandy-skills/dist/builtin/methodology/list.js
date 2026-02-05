import { promises as fs } from "fs";
import * as path from "path";
import * as os from "os";
// Helper function to get methods directory
export const getMethodsDir = () => path.join(os.homedir(), ".belldandy", "methods");
export const methodListTool = {
    definition: {
        name: "method_list",
        description: "列出所有可用的方法论文档 (Methods)。在开始复杂任务前，应该先调用此工具查看是否有现成的方法可供参考。",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    execute: async (args, _context) => {
        const methodsDir = getMethodsDir();
        try {
            await fs.mkdir(methodsDir, { recursive: true });
            const files = await fs.readdir(methodsDir);
            const mdFiles = files.filter(f => f.endsWith('.md'));
            if (mdFiles.length === 0) {
                return {
                    id: "method_list",
                    name: "method_list",
                    success: true,
                    output: "目前没有存储任何方法文档。请根据任务经验创建新的方法。",
                    durationMs: 0
                };
            }
            return {
                id: "method_list",
                name: "method_list",
                success: true,
                output: `找到 ${mdFiles.length} 个方法文档:\n` + mdFiles.map(f => `- ${f}`).join('\n'),
                durationMs: 0
            };
        }
        catch (error) {
            const err = error;
            return {
                id: "error",
                name: "method_list",
                success: false,
                output: `无法列出方法文件: ${err.message}`,
                error: err.message,
                durationMs: 0
            };
        }
    }
};
//# sourceMappingURL=list.js.map