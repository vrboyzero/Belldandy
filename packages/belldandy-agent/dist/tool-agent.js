/**
 * 工具增强型 Agent
 *
 * 支持工具调用的 Agent 实现，集成完整的钩子系统。
 */
import { FailoverClient } from "./failover-client.js";
import { buildUrl, preprocessMultimodalContent } from "./multimodal.js";
export class ToolEnabledAgent {
    opts;
    failoverClient;
    constructor(opts) {
        this.opts = {
            ...opts,
            timeoutMs: opts.timeoutMs ?? 120_000,
            maxToolCalls: opts.maxToolCalls ?? 10,
        };
        // 初始化容灾客户端
        this.failoverClient = new FailoverClient({
            primary: { id: "primary", baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: opts.model },
            fallbacks: opts.fallbacks,
            logger: opts.failoverLogger,
        });
    }
    async *run(input) {
        const startTime = Date.now();
        const legacyHookCtx = { agentId: "tool-agent", conversationId: input.conversationId };
        // 新版钩子上下文
        const agentHookCtx = {
            agentId: "tool-agent",
            sessionKey: input.conversationId,
        };
        // Hook: beforeRun / before_agent_start
        // 优先使用新版 hookRunner，向后兼容旧版 hooks
        if (this.opts.hookRunner) {
            try {
                const hookRes = await this.opts.hookRunner.runBeforeAgentStart({ prompt: typeof input.content === 'string' ? input.content : input.text, messages: input.history }, // TODO: Update hook types for multimodal
                agentHookCtx);
                if (hookRes) {
                    // 注入系统提示词前置上下文
                    if (hookRes.prependContext) {
                        input = { ...input, text: `${hookRes.prependContext}\n\n${input.text}` };
                    }
                    // systemPrompt 由 hook 返回时，覆盖原有
                    // 这里暂不处理 systemPrompt，保留给调用方在 opts 中设置
                }
            }
            catch (err) {
                yield { type: "status", status: "error" };
                yield { type: "final", text: `钩子 before_agent_start 执行失败: ${err}` };
                return;
            }
        }
        else if (this.opts.hooks?.beforeRun) {
            // 向后兼容：旧版 hooks
            try {
                const hookRes = await this.opts.hooks.beforeRun({ input }, legacyHookCtx);
                if (hookRes && typeof hookRes === "object") {
                    input = { ...input, ...hookRes };
                }
            }
            catch (err) {
                yield { type: "status", status: "error" };
                yield { type: "final", text: `Hook beforeRun failed: ${err}` };
                return;
            }
        }
        yield { type: "status", status: "running" };
        let content = input.content || input.text;
        // Preprocess: upload local videos to Moonshot
        const needsVideoUpload = Array.isArray(content) &&
            content.some((p) => p.type === "video_url" && p.video_url?.url?.startsWith("file://"));
        if (needsVideoUpload) {
            yield { type: "status", status: "uploading_video" };
            const profiles = this.failoverClient.getProfiles();
            const profile = profiles.find(p => p.id === "primary") || profiles[0];
            if (profile) {
                const result = await preprocessMultimodalContent(content, profile, this.opts.videoUploadConfig);
                content = result.content;
            }
        }
        const messages = buildInitialMessages(this.opts.systemPrompt, content, input.history);
        const tools = this.opts.toolExecutor.getDefinitions();
        let toolCallCount = 0;
        const generatedItems = [];
        let runSuccess = true;
        let runError;
        // 辅助函数：yield 并收集 items
        const yieldItem = async function* (item) {
            generatedItems.push(item);
            yield item;
        };
        try {
            while (true) {
                // 调用模型
                const response = await this.callModel(messages, tools.length > 0 ? tools : undefined);
                if (!response.ok) {
                    runSuccess = false;
                    runError = response.error;
                    yield* yieldItem({ type: "final", text: response.error });
                    yield* yieldItem({ type: "status", status: "error" });
                    return;
                }
                // 输出文本增量（如果有）；先剥离工具调用协议块，避免在对话中展示
                const contentForDisplay = stripToolCallsSection(response.content || "");
                if (contentForDisplay) {
                    for (const delta of splitText(contentForDisplay, 16)) {
                        yield* yieldItem({ type: "delta", delta });
                    }
                }
                // 检查是否有工具调用
                const toolCalls = response.toolCalls;
                if (!toolCalls || toolCalls.length === 0) {
                    // 无工具调用，输出最终结果（已剥离协议块）
                    yield* yieldItem({ type: "final", text: contentForDisplay });
                    yield* yieldItem({ type: "status", status: "done" });
                    return;
                }
                // 防止无限循环
                toolCallCount += toolCalls.length;
                if (toolCallCount > this.opts.maxToolCalls) {
                    runSuccess = false;
                    runError = `工具调用次数超限（最大 ${this.opts.maxToolCalls} 次）`;
                    yield* yieldItem({ type: "final", text: runError });
                    yield* yieldItem({ type: "status", status: "error" });
                    return;
                }
                // 将 assistant 消息（含 tool_calls）加入历史
                messages.push({
                    role: "assistant",
                    content: response.content || undefined,
                    tool_calls: toolCalls,
                });
                // 执行工具调用
                for (const tc of toolCalls) {
                    const request = {
                        id: tc.id,
                        name: tc.function.name,
                        arguments: safeParseJson(tc.function.arguments),
                    };
                    const toolStartTime = Date.now();
                    // 工具钩子上下文
                    const toolHookCtx = {
                        agentId: "tool-agent",
                        sessionKey: input.conversationId,
                        toolName: request.name,
                    };
                    // Hook: beforeToolCall / before_tool_call
                    if (this.opts.hookRunner) {
                        try {
                            const hookRes = await this.opts.hookRunner.runBeforeToolCall({ toolName: request.name, params: request.arguments }, toolHookCtx);
                            if (hookRes?.block) {
                                // 被钩子阻止
                                const reason = hookRes.blockReason || "被钩子阻止";
                                yield* yieldItem({ type: "final", text: `工具 ${request.name} 执行被阻止: ${reason}` });
                                continue;
                            }
                            if (hookRes?.params) {
                                request.arguments = hookRes.params;
                            }
                        }
                        catch (err) {
                            yield* yieldItem({ type: "final", text: `钩子 before_tool_call 执行失败: ${err}` });
                            continue;
                        }
                    }
                    else if (this.opts.hooks?.beforeToolCall) {
                        // 向后兼容：旧版 hooks
                        try {
                            const hookRes = await this.opts.hooks.beforeToolCall({
                                toolName: request.name,
                                arguments: request.arguments,
                                id: request.id
                            }, legacyHookCtx);
                            if (hookRes === false) {
                                yield* yieldItem({ type: "final", text: `Tool execution cancelled by hook: ${request.name}` });
                                continue;
                            }
                            if (hookRes && typeof hookRes === "object") {
                                request.arguments = hookRes;
                            }
                        }
                        catch (err) {
                            yield* yieldItem({ type: "final", text: `Hook beforeToolCall failed: ${err}` });
                            continue;
                        }
                    }
                    // 广播工具调用事件
                    yield* yieldItem({
                        type: "tool_call",
                        id: request.id,
                        name: request.name,
                        arguments: request.arguments,
                    });
                    // 执行工具
                    const result = await this.opts.toolExecutor.execute(request, input.conversationId);
                    const toolDurationMs = Date.now() - toolStartTime;
                    // Hook: afterToolCall / after_tool_call
                    if (this.opts.hookRunner) {
                        try {
                            await this.opts.hookRunner.runAfterToolCall({
                                toolName: result.name,
                                params: request.arguments,
                                result: result.output,
                                error: result.error,
                                durationMs: toolDurationMs,
                            }, toolHookCtx);
                        }
                        catch (err) {
                            this.opts.logger?.error("agent", `钩子 after_tool_call 执行失败: ${err}`) ?? console.error(`钩子 after_tool_call 执行失败: ${err}`);
                        }
                    }
                    else if (this.opts.hooks?.afterToolCall) {
                        // 向后兼容：旧版 hooks
                        try {
                            await this.opts.hooks.afterToolCall({
                                toolName: result.name,
                                arguments: request.arguments,
                                result: result.output,
                                success: result.success,
                                error: result.error,
                                id: result.id
                            }, legacyHookCtx);
                        }
                        catch (err) {
                            this.opts.logger?.error("agent", `Hook afterToolCall failed: ${err}`) ?? console.error(`Hook afterToolCall failed: ${err}`);
                        }
                    }
                    // 广播工具结果事件
                    yield* yieldItem({
                        type: "tool_result",
                        id: result.id,
                        name: result.name,
                        success: result.success,
                        output: result.output,
                        error: result.error,
                    });
                    // 将工具结果加入消息历史
                    messages.push({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: result.success ? result.output : `错误：${result.error}`,
                    });
                }
                // 继续循环，让模型处理工具结果
            }
        }
        finally {
            const durationMs = Date.now() - startTime;
            // Hook: afterRun / agent_end
            if (this.opts.hookRunner) {
                try {
                    await this.opts.hookRunner.runAgentEnd({
                        messages: generatedItems,
                        success: runSuccess,
                        error: runError,
                        durationMs,
                    }, agentHookCtx);
                }
                catch (err) {
                    this.opts.logger?.error("agent", `钩子 agent_end 执行失败: ${err}`) ?? console.error(`钩子 agent_end 执行失败: ${err}`);
                }
            }
            else if (this.opts.hooks?.afterRun) {
                // 向后兼容：旧版 hooks
                try {
                    await this.opts.hooks.afterRun({ input, items: generatedItems }, legacyHookCtx);
                }
                catch (err) {
                    this.opts.logger?.error("agent", `Hook afterRun failed: ${err}`) ?? console.error(`Hook afterRun failed: ${err}`);
                }
            }
        }
    }
    async callModel(messages, tools) {
        try {
            const payload = {
                model: "__PLACEHOLDER__", // 将由 buildRequest 覆盖
                messages,
                stream: false, // 工具调用模式使用非流式简化解析
            };
            if (tools && tools.length > 0) {
                payload.tools = tools;
                payload.tool_choice = "auto";
                // Kimi K2.5 requires thinking mode to be disabled when using tool calls
                // https://platform.moonshot.cn/docs/api/chat
                payload.thinking = { type: "disabled" };
            }
            // 使用容灾客户端发送请求
            const { response: res } = await this.failoverClient.fetchWithFailover({
                timeoutMs: this.opts.timeoutMs,
                buildRequest: (profile) => {
                    // 替换占位符为实际 profile 的模型名
                    const actualPayload = { ...payload, model: profile.model };
                    return {
                        url: buildUrl(profile.baseUrl, "/chat/completions"),
                        init: {
                            method: "POST",
                            headers: {
                                "content-type": "application/json",
                                authorization: `Bearer ${profile.apiKey}`,
                            },
                            body: JSON.stringify(actualPayload),
                        },
                    };
                },
            });
            if (!res.ok) {
                const text = await safeReadText(res);
                return { ok: false, error: `模型调用失败（HTTP ${res.status}）：${text}` };
            }
            const json = (await res.json());
            const choice = json.choices?.[0];
            if (!choice) {
                return { ok: false, error: "模型返回空响应" };
            }
            const message = choice.message;
            const content = typeof message?.content === "string" ? message.content : "";
            const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : undefined;
            return { ok: true, content, toolCalls };
        }
        catch (err) {
            if (err instanceof Error && err.name === "AbortError") {
                return { ok: false, error: `模型调用超时（${this.opts.timeoutMs}ms）` };
            }
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
    }
}
function buildInitialMessages(systemPrompt, userContent, history) {
    const messages = [];
    // Layer 1: System
    if (systemPrompt?.trim()) {
        messages.push({ role: "system", content: systemPrompt.trim() });
    }
    // Layer 2: History
    if (history && history.length > 0) {
        // 简单转换，tool agent 目前只支持基础 user/assistant 历史
        // 复杂 tool history 暂不还原（保持无状态简单性）
        for (const msg of history) {
            if (msg.role === "user" || msg.role === "assistant") {
                messages.push({ role: msg.role, content: msg.content });
            }
        }
    }
    // Layer 3: Current User Message
    messages.push({ role: "user", content: userContent });
    return messages;
}
function safeParseJson(str) {
    try {
        const parsed = JSON.parse(str);
        return typeof parsed === "object" && parsed !== null ? parsed : {};
    }
    catch {
        return {};
    }
}
async function safeReadText(res) {
    try {
        const text = await res.text();
        return text.length > 500 ? `${text.slice(0, 500)}…` : text;
    }
    catch {
        return "";
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
/** 移除模型输出中的工具调用协议块，避免在对话中展示给用户 */
function stripToolCallsSection(text) {
    if (!text || typeof text !== "string")
        return text;
    return text
        .replace(/<\|tool_calls_section_begin\|>[\s\S]*?<\|tool_calls_section_end\|>/g, "\n\n（正在执行操作）\n\n")
        .replace(/<\|tool_call_begin\|>[\s\S]*?<\|tool_call_end\|>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
//# sourceMappingURL=tool-agent.js.map