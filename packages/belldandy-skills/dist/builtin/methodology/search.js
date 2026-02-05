import { promises as fs } from "fs";
import * as path from "path";
import { getMethodsDir } from "./list.js";
export const methodSearchTool = {
    definition: {
        name: "method_search",
        description: "通过关键词搜索方法论文档。当不确定具体文件名时使用。",
        parameters: {
            type: "object",
            properties: {
                keyword: {
                    type: "string",
                    description: "搜索关键词"
                }
            },
            required: ["keyword"]
        }
    },
    execute: async (args, _context) => {
        const keyword = args.keyword?.toLowerCase();
        if (!keyword)
            return { id: "error", name: "method_search", success: false, output: "Empty keyword", durationMs: 0 };
        const methodsDir = getMethodsDir();
        try {
            await fs.mkdir(methodsDir, { recursive: true });
            const files = await fs.readdir(methodsDir);
            const mdFiles = files.filter(f => f.endsWith('.md'));
            const results = [];
            // 简单的遍历搜索 (MVP)
            for (const file of mdFiles) {
                const content = await fs.readFile(path.join(methodsDir, file), "utf-8");
                if (file.toLowerCase().includes(keyword) || content.toLowerCase().includes(keyword)) {
                    // 截取一点上下文
                    results.push(`- [${file}]: (Matched)`);
                }
            }
            if (results.length === 0) {
                return {
                    id: "method_search",
                    name: "method_search",
                    success: true,
                    output: `未找到包含 "${keyword}" 的方法文档。`,
                    durationMs: 0
                };
            }
            return {
                id: "method_search",
                name: "method_search",
                success: true,
                output: `找到 ${results.length} 个相关方法:\n${results.join('\n')}`,
                durationMs: 0
            };
        }
        catch (error) {
            return {
                id: "error",
                name: "method_search",
                success: false,
                output: `搜索失败: ${error.message}`,
                durationMs: 0
            };
        }
    }
};
//# sourceMappingURL=search.js.map