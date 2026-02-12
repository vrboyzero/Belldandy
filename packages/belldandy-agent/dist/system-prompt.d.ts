import type { WorkspaceLoadResult } from "./workspace.js";
/**
 * System Prompt 构建参数
 */
export type SystemPromptParams = {
    /** Workspace 加载结果 */
    workspace?: WorkspaceLoadResult;
    /** 额外的 system prompt（叠加在 Workspace 内容之后） */
    extraSystemPrompt?: string;
    /** 用户时区 */
    userTimezone?: string;
    /** 当前时间 */
    currentTime?: string;
    /** 是否注入 AGENTS.md (默认 true) */
    injectAgents?: boolean;
    /** 是否注入 SOUL.md (默认 true) */
    injectSoul?: boolean;
    /** 是否注入 MEMORY.md (默认 true) */
    injectMemory?: boolean;
    /** 最大字符数限制，超过则按优先级截断低优先级段落（0 或 undefined 表示不限制） */
    maxChars?: number;
};
/**
 * 构建完整的 System Prompt
 *
 * 将 Workspace 引导文件内容注入 system prompt，使 Agent 具有人格化特征。
 *
 * 注入顺序：
 * 1. 核心身份声明
 * 2. AGENTS.md（工作空间指南，包含连续性/记忆系统说明）
 * 3. SOUL.md（人格准则）
 * 4. IDENTITY.md（身份信息）
 * 5. USER.md（用户档案）
 * 6. TOOLS.md（工具说明）
 * 7. BOOTSTRAP.md（首次引导，如有）
 * 8. 时间信息
 * 9. 额外 system prompt
 * 10. Methodology 系统协议
 */
export declare function buildSystemPrompt(params: SystemPromptParams): string;
/**
 * 构建仅包含 Workspace 内容的 prompt 片段
 * （用于已有 system prompt 基础上叠加）
 */
export declare function buildWorkspaceContext(workspace: WorkspaceLoadResult): string;
//# sourceMappingURL=system-prompt.d.ts.map