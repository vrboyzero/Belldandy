export { OpenAIChatAgent } from "./openai.js";
export { ToolEnabledAgent } from "./tool-agent.js";
// Workspace & System Prompt (SOUL/Persona)
export { ensureWorkspace, loadWorkspaceFiles, needsBootstrap, createBootstrapFile, removeBootstrapFile, SOUL_FILENAME, IDENTITY_FILENAME, USER_FILENAME, BOOTSTRAP_FILENAME, AGENTS_FILENAME, TOOLS_FILENAME, HEARTBEAT_FILENAME, } from "./workspace.js";
export { buildSystemPrompt, buildWorkspaceContext, } from "./system-prompt.js";
export { ConversationStore, } from "./conversation.js";
export class MockAgent {
    async *run(input) {
        yield { type: "status", status: "running" };
        const response = `Belldandy(MVP) 收到：${input.text}`;
        const chunks = splitText(response, 6);
        let out = "";
        for (const delta of chunks) {
            out += delta;
            await sleep(60);
            yield { type: "delta", delta };
        }
        yield { type: "final", text: out };
        yield { type: "status", status: "done" };
    }
}
function splitText(text, size) {
    const out = [];
    let i = 0;
    while (i < text.length) {
        out.push(text.slice(i, i + Math.max(1, size)));
        i += Math.max(1, size);
    }
    return out;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// 钩子系统
export * from "./hooks.js";
export { createHookRunner } from "./hook-runner.js";
//# sourceMappingURL=index.js.map