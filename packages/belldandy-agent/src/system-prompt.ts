import type { WorkspaceFile, WorkspaceLoadResult } from "./workspace.js";
import { SOUL_FILENAME, IDENTITY_FILENAME, USER_FILENAME, BOOTSTRAP_FILENAME, AGENTS_FILENAME, TOOLS_FILENAME, MEMORY_FILENAME } from "./workspace.js";

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
export function buildSystemPrompt(params: SystemPromptParams): string {
    const lines: string[] = [];

    // 核心身份声明
    lines.push("You are Belldandy, a personal AI assistant running locally on your user's device.");
    lines.push("");

    const workspace = params.workspace;
    const files = workspace?.files ?? [];

    // 查找各文件
    const agentsFile = files.find(f => f.name === AGENTS_FILENAME && !f.missing);
    const soulFile = files.find(f => f.name === SOUL_FILENAME && !f.missing);
    const toolsFile = files.find(f => f.name === TOOLS_FILENAME && !f.missing);
    const identityFile = files.find(f => f.name === IDENTITY_FILENAME && !f.missing);
    const userFile = files.find(f => f.name === USER_FILENAME && !f.missing);
    const bootstrapFile = files.find(f => f.name === BOOTSTRAP_FILENAME && !f.missing);
    const memoryFile = files.find(f => f.name === MEMORY_FILENAME && !f.missing);

    // 默认开启注入
    const shouldInjectAgents = params.injectAgents ?? true;
    const shouldInjectSoul = params.injectSoul ?? true;
    const shouldInjectMemory = params.injectMemory ?? true;

    // 注入 AGENTS.md（工作空间指南）
    if (shouldInjectAgents && agentsFile?.content) {
        lines.push("# Workspace Guide");
        lines.push("");
        lines.push("The following is your workspace guide - how to operate in this environment.");
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push(agentsFile.content.trim());
        lines.push("");
        lines.push("---");
        lines.push("");
    }

    // 注入 SOUL.md（人格准则）
    if (shouldInjectSoul && soulFile?.content) {
        lines.push("# Persona & Guidelines");
        lines.push("");
        lines.push("The following is your SOUL - your core personality and behavioral guidelines.");
        lines.push("Embody its persona and tone. Avoid stiff, generic replies; follow its guidance.");
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push(soulFile.content.trim());
        lines.push("");
        lines.push("---");
        lines.push("");
    }

    // 注入 MEMORY.md (长期记忆/注意事项)
    if (shouldInjectMemory && memoryFile?.content) {
        lines.push("# Core Memory & Notes");
        lines.push("");
        lines.push("The following is your MEMORY - important facts, rules, or context to always remember.");
        lines.push("");
        lines.push("---");
        lines.push("");
        lines.push(memoryFile.content.trim());
        lines.push("");
        lines.push("---");
        lines.push("");
    }

    // 注入 IDENTITY.md（身份信息）
    if (identityFile?.content) {
        lines.push("# Your Identity");
        lines.push("");
        lines.push("The following describes who you are:");
        lines.push("");
        lines.push(identityFile.content.trim());
        lines.push("");
    }

    // 注入 USER.md（用户档案）
    if (userFile?.content) {
        lines.push("# Your User");
        lines.push("");
        lines.push("The following describes the person you are helping:");
        lines.push("");
        lines.push(userFile.content.trim());
        lines.push("");
    }

    // 注入 TOOLS.md（工具说明）
    if (toolsFile?.content) {
        lines.push("# Tools & Local Setup");
        lines.push("");
        lines.push("The following contains local tool configuration and environment-specific notes:");
        lines.push("");
        lines.push(toolsFile.content.trim());
        lines.push("");
    }

    // 注入 BOOTSTRAP.md（首次引导）
    if (bootstrapFile?.content) {
        lines.push("# Bootstrap Instructions");
        lines.push("");
        lines.push("This is your first time waking up. Follow these instructions to get to know your user:");
        lines.push("");
        lines.push(bootstrapFile.content.trim());
        lines.push("");
        lines.push("IMPORTANT: After completing the bootstrap conversation, use file_write to update IDENTITY.md and USER.md with what you learned, then delete BOOTSTRAP.md.");
        lines.push("");
    }

    // 时间信息
    if (params.userTimezone || params.currentTime) {
        lines.push("# Current Context");
        lines.push("");
        if (params.userTimezone) {
            lines.push(`Time zone: ${params.userTimezone}`);
        }
        if (params.currentTime) {
            lines.push(`Current time: ${params.currentTime}`);
        }
        lines.push("");
    }

    // 额外 system prompt
    const extra = params.extraSystemPrompt?.trim();
    if (extra) {
        lines.push("# Additional Instructions");
        lines.push("");
        lines.push(extra);
        lines.push("");
    }

    // --- Methodology Protocol (System Native) ---
    lines.push("# Methodology System (Auto-Injected)");
    lines.push("");
    lines.push(`You have access to a dynamic "Methodology" system located in \`~/.belldandy/methods/\`.`);
    lines.push(`This is your "Procedural Memory" - a library of Standard Operating Procedures (SOPs).`);
    lines.push("");
    lines.push("## Execution Protocol");
    lines.push("1. **Check First**: Before starting a complex task (e.g., system config, deployment), ALWAYS check for existing methods.");
    lines.push("   - Use `method_list` or `method_search` to find relevant docs.");
    lines.push("   - Use `method_read` to load the SOP.");
    lines.push("   - **Follow the method strictly** if found.");
    lines.push("");
    lines.push("2. **Knowledge Distillation**: After completing a task, REFLECT: 'Did I learn a reusable pattern?'");
    lines.push("   - If yes -> Use `method_create` to save/update the Method.");
    lines.push("   - Filename: `[Target]-[Action]-[Suffix].md` (e.g., `Nginx-deploy-static.md`).");
    lines.push("   - Content: Include Context, Steps, Tools Used, and Pitfalls.");
    lines.push("");
    lines.push("**Goal**: Do not rely on ephemeral context alone. Crystallize your experience into persistent Methods.");
    lines.push("");

    // 注入 Workspace 目录路径（供 Agent 参考）
    if (workspace) {
        lines.push(`Workspace directory: ${workspace.dir}`);
        lines.push("");
    }

    return lines.join("\n").trim();
}

/**
 * 构建仅包含 Workspace 内容的 prompt 片段
 * （用于已有 system prompt 基础上叠加）
 */
export function buildWorkspaceContext(workspace: WorkspaceLoadResult): string {
    const lines: string[] = [];

    const files = workspace.files.filter(f => !f.missing && f.content);

    if (files.length === 0) {
        return "";
    }

    lines.push("# Workspace Context Files");
    lines.push("");

    for (const file of files) {
        lines.push(`## ${file.name}`);
        lines.push("");
        lines.push(file.content!.trim());
        lines.push("");
    }

    return lines.join("\n").trim();
}
