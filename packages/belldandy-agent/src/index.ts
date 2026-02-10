import type { JsonObject } from "@belldandy/protocol";

export { OpenAIChatAgent, type OpenAIChatAgentOptions } from "./openai.js";
export { ToolEnabledAgent, type ToolEnabledAgentOptions } from "./tool-agent.js";

// Failover（模型容灾）
export {
  FailoverClient,
  loadModelFallbacks,
  classifyFailoverReason,
  isRetryableReason,
  type ModelProfile,
  type FailoverReason,
  type FailoverAttempt,
  type FailoverResult,
  type FailoverLogger,
  type ModelConfigFile,
} from "./failover-client.js";

// Workspace & System Prompt (SOUL/Persona)
export {
  ensureWorkspace,
  loadWorkspaceFiles,
  needsBootstrap,
  createBootstrapFile,
  removeBootstrapFile,
  SOUL_FILENAME,
  IDENTITY_FILENAME,
  USER_FILENAME,
  BOOTSTRAP_FILENAME,
  AGENTS_FILENAME,
  TOOLS_FILENAME,
  HEARTBEAT_FILENAME,
  type WorkspaceFile,
  type WorkspaceFileName,
  type WorkspaceLoadResult,
} from "./workspace.js";

export {
  buildSystemPrompt,
  buildWorkspaceContext,
  type SystemPromptParams,
} from "./system-prompt.js";

export {
  ConversationStore,
  type Conversation,
  type ConversationMessage,
  type ConversationStoreOptions,
} from "./conversation.js";

export type AgentRunInput = {
  conversationId: string;
  text: string;
  meta?: JsonObject;
  /** 对话历史（role 必须是 user 或 assistant） */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
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

export type AgentStreamItem =
  | AgentDelta
  | AgentFinal
  | AgentStatus
  | AgentToolCall
  | AgentToolResult;

export interface BelldandyAgent {
  run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}

export class MockAgent implements BelldandyAgent {
  async *run(input: AgentRunInput): AsyncIterable<AgentStreamItem> {
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

function splitText(text: string, size: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    out.push(text.slice(i, i + Math.max(1, size)));
    i += Math.max(1, size);
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 钩子系统
export * from "./hooks.js";
export { createHookRunner, type HookRunner, type HookRunnerLogger, type HookRunnerOptions } from "./hook-runner.js";
