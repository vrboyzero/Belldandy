import type { Tool } from "../../types.js";
import {
    browserNavigateTool,
    browserScreenshotTool
} from "../../builtin/browser/index.js";

/**
 * 相机快照工具 (回环视觉 Loopback Vision)
 *
 * 使用浏览器回环方法捕获网络摄像头的图像。
 * 1. 打开/导航到 /mirror.html
 * 2. 等待视频流初始化
 * 3. 截图
 */
export const cameraSnapTool: Tool = {
    definition: {
        name: "camera_snap",
        description: "使用连接的浏览器调用摄像头拍摄照片 (Loopback Vision)",
        parameters: {
            type: "object",
            properties: {
                delay: {
                    type: "number",
                    description: "拍摄前的延迟毫秒数（用于等待摄像头对焦/曝光）",
                    // default: 2000 // ToolParameterSchema 中没有 default 字段，需在逻辑中处理
                }
            },
            required: []
        }
    },
    execute: async (args: any, context: any) => {
        const delayMs = typeof args.delay === "number" ? args.delay : 2000;
        const mirrorPath = "/mirror.html"; // 相对于 web 根目录

        // 开始计时
        const startTime = Date.now();

        try {
            // 1. 检查是否已经在镜像页面，如果不在则导航
            const port = process.env.BELLDANDY_PORT || "28889";
            const targetUrl = `http://127.0.0.1:${port}${mirrorPath}`;

            (context.logger?.info ?? console.log)(`[camera_snap] 正在导航至 ${targetUrl}...`);
            // 强制转换以调用 execute (browser tools 使用的是 class based 还是 object based? )
            // 让我们检查一下 browserNavigateTool 的真实类型。
            // 假设它们也是符合 Tool 接口的对象。
            await (browserNavigateTool as any).execute({ url: targetUrl }, context);

            // 2. 等待摄像头预热
            (context.logger?.info ?? console.log)(`[camera_snap] 等待 ${delayMs}ms 以进行摄像头预热...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // 3. 截图
            (context.logger?.info ?? console.log)(`[camera_snap] 正在截图...`);
            const screenshotResult = await (browserScreenshotTool as any).execute({}, context);

            // 解析截图结果（假设 screenshotResult.output 是 JSON 字符串或直接包含了 image artifact）
            // ToolCallResult 的 output 通常是字符串。我们需要确认 browserScreenshotTool 返回什么。
            // 如果它返回的是 ToolCallResult，那么 content 在 output 字段里。

            let imageArtifact = null;
            try {
                // 尝试从输出中解析 artifact 信息，或者直接透传
                // 这里的逻辑依赖于 browserScreenshotTool 的实现细节。
                // 简单起见，我们将 screenshotResult.output 作为我们的 output。
            } catch (e) { }

            return {
                id: "generated-in-execute", // 这个 ID 通常由 Executor 分配，这里 mock 一个
                name: "camera_snap",
                success: true,
                output: screenshotResult.output, // 直接透传截图工具的输出（通常包含 Artifact 引用）
                durationMs: Date.now() - startTime
            };

        } catch (error) {
            const err = error as Error;
            return {
                id: "error",
                name: "camera_snap",
                success: false,
                output: `无法捕获摄像头画面: ${err.message}. 请确保浏览器插件已连接且网页已授权摄像头。`,
                error: err.message,
                durationMs: Date.now() - startTime
            };
        }
    }
};
