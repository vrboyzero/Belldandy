import type { JsonObject } from "@belldandy/protocol";
export { OpenAIChatAgent, type OpenAIChatAgentOptions } from "./openai.js";
export { ToolEnabledAgent, type ToolEnabledAgentOptions } from "./tool-agent.js";
export { FailoverClient, loadModelFallbacks, classifyFailoverReason, isRetryableReason, type ModelProfile, type FailoverReason, type FailoverAttempt, type FailoverResult, type FailoverLogger, type ModelConfigFile, } from "./failover-client.js";
export { ensureWorkspace, loadWorkspaceFiles, needsBootstrap, createBootstrapFile, removeBootstrapFile, SOUL_FILENAME, IDENTITY_FILENAME, USER_FILENAME, BOOTSTRAP_FILENAME, AGENTS_FILENAME, TOOLS_FILENAME, HEARTBEAT_FILENAME, type WorkspaceFile, type WorkspaceFileName, type WorkspaceLoadResult, } from "./workspace.js";
export { buildSystemPrompt, buildWorkspaceContext, type SystemPromptParams, } from "./system-prompt.js";
export { ConversationStore, type Conversation, type ConversationMessage, type ConversationStoreOptions, } from "./conversation.js";
export type AgentRunInput = {
    conversationId: string;
    text: string;
    meta?: JsonObject;
    /** 对话历史（role 必须是 user 或 assistant） */
    history?: Array<{
        role: "user" | "assistant";
        content: string;
    }>;
};
export type AgentDelta = {
    type: "delta";
    delta: string;
};
export type AgentFinal = {
    type: "final";
    text: string;
};
export type AgentStatus = {
    type: "status";
    status: "running" | "done" | "error";
};
export type AgentToolCall = {
    type: "tool_call";
    id: string;
    name: string;
    arguments: JsonObject;
};
export type AgentToolResult = {
    type: "tool_result";
    id: string;
    name: string;
    success: boolean;
    output: string;
    error?: string;
};
export type AgentStreamItem = AgentDelta | AgentFinal | AgentStatus | AgentToolCall | AgentToolResult;
export interface BelldandyAgent {
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}
export declare class MockAgent implements BelldandyAgent {
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}
export * from "./hooks.js";
export { createHookRunner, type HookRunner, type HookRunnerLogger, type HookRunnerOptions } from "./hook-runner.js";
//# sourceMappingURL=index.d.ts.map