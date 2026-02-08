import * as lark from "@larksuiteoapi/node-sdk";
import type { BelldandyAgent } from "@belldandy/agent";
import type { Channel } from "./types.js";

import { ConversationStore } from "@belldandy/agent";

export interface FeishuChannelConfig {
    appId: string;
    appSecret: string;
    agent: BelldandyAgent;
    conversationStore: ConversationStore;
    initialChatId?: string;
    onChatIdUpdate?: (chatId: string) => void;
}

/**
 * 飞书渠道实现
 * 使用 WebSocket 长连接模式，无需公网 IP
 */
export class FeishuChannel implements Channel {
    /** 渠道名称 */
    readonly name = "feishu";

    private readonly client: lark.Client;
    private readonly wsClient: lark.WSClient;
    private readonly agent: BelldandyAgent;
    private readonly conversationStore: ConversationStore;
    private _running = false;
    private lastChatId?: string; // Track the last active chat for proactive messaging
    private onChatIdUpdate?: (chatId: string) => void;

    // Deduplication: track processed message IDs to avoid responding multiple times
    private readonly processedMessages = new Set<string>();
    private readonly MESSAGE_CACHE_SIZE = 1000;

    /** 渠道是否正在运行 */
    get isRunning(): boolean {
        return this._running;
    }

    constructor(config: FeishuChannelConfig) {
        this.agent = config.agent;
        this.conversationStore = config.conversationStore;

        // HTTP Client for sending messages
        this.client = new lark.Client({
            appId: config.appId,
            appSecret: config.appSecret,
        });

        // WebSocket Client for receiving events
        this.wsClient = new lark.WSClient({
            appId: config.appId,
            appSecret: config.appSecret,
            loggerLevel: lark.LoggerLevel.info,
        });

        // Store callback
        this.onChatIdUpdate = config.onChatIdUpdate;

        // setupEventHandlers was removed

        if (config.initialChatId) {
            this.lastChatId = config.initialChatId;
            console.log(`Feishu: Restored last chat ID: ${this.lastChatId}`);
        }
    }



    async start(): Promise<void> {
        if (this._running) return;

        // Create an event dispatcher
        const eventDispatcher = new lark.EventDispatcher({}).register({
            "im.message.receive_v1": async (data) => {
                await this.handleMessage(data);
            },
        });

        // Start WS connection with the dispatcher
        await this.wsClient.start({
            eventDispatcher,
        });

        this._running = true;
        console.log(`[${this.name}] WebSocket Channel started.`);
    }

    async stop(): Promise<void> {
        if (!this._running) return;

        try {
            // Note: @larksuiteoapi/node-sdk WSClient 目前没有公开的 stop/close 方法
            // 如果未来 SDK 支持，可以在这里调用
            // await this.wsClient.stop();

            this._running = false;
            this.processedMessages.clear();
            console.log(`[${this.name}] Channel stopped.`);
        } catch (e) {
            console.error(`[${this.name}] Error stopping channel:`, e);
            throw e;
        }
    }

    private async handleMessage(data: any) {
        // SDK directly passes the event data, not nested under data.event
        // Based on official example: const { message: { chat_id, content} } = data;
        const message = data.message;
        const sender = data.sender;

        if (!message) {
            console.error("Feishu: message object is undefined in event data", data);
            return;
        }

        // Ignore updates, own messages, or system messages if needed
        // Usually we check message_type

        if (message.message_type !== "text") {
            // For now, only handle text
            // TODO: Support images/files
            return;
        }

        const chatId = message.chat_id;
        if (this.lastChatId !== chatId) {
            this.lastChatId = chatId;
            // Notify listener for persistence
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.onChatIdUpdate?.(chatId);
        }
        const msgId = message.message_id;

        // === Deduplication: skip if we've already processed this message ===
        if (this.processedMessages.has(msgId)) {
            console.log(`Feishu: Skipping duplicate message ${msgId}`);
            return;
        }
        // Mark as processed immediately to prevent concurrent processing
        this.processedMessages.add(msgId);
        // Limit cache size to prevent memory leak
        if (this.processedMessages.size > this.MESSAGE_CACHE_SIZE) {
            const firstKey = this.processedMessages.values().next().value;
            if (firstKey) this.processedMessages.delete(firstKey);
        }

        // Content is a JSON string: "{\"text\":\"hello\"}"
        let text = "";
        try {
            const contentObj = JSON.parse(message.content);
            text = contentObj.text;
        } catch (e) {
            console.error("Failed to parse Feishu message content", e);
            return;
        }

        // Ignore empty messages
        if (!text) return;

        console.log(`Feishu: Processing message ${msgId} from chat ${chatId}: "${text.slice(0, 50)}..."`);

        // Run the agent
        // We create a history context if possible, but for MVP we just send the text
        // The agent is responsible for context via ConversationStore (not linked here yet)
        // We pass conversationId as chatId

        // [PERSISTENCE] Add User Message to Store
        this.conversationStore.addMessage(chatId, "user", text);

        // [PERSISTENCE] Get History from Store
        const history = this.conversationStore.getHistory(chatId);

        const runInput = {
            conversationId: chatId, // Map Feishu Chat ID to Conversation ID
            text: text,
            history: history, // Provide history context
            // We could pass sender info in meta
            meta: {
                from: sender,
                messageId: msgId,
                channel: "feishu"
            }
        };

        try {
            const stream = this.agent.run(runInput);
            let replyText = "";

            for await (const item of stream) {
                if (item.type === "delta") {
                    // Streaming is tricky with Feishu unless we use "card" updates.
                    // For simplicity in MVP, we accumulate and send send/reply at the end.
                    replyText += item.delta;
                } else if (item.type === "final") {
                    replyText = item.text; // Ensure we get the final full text if provided
                } else if (item.type === "tool_call") {
                    console.log(`Feishu: Tool call: ${item.name}`, item.arguments);
                } else if (item.type === "tool_result") {
                    console.log(`Feishu: Tool result: ${item.name} - success: ${item.success}`,
                        item.success ? item.output?.slice(0, 100) : item.error);
                }
            }

            if (replyText) {
                // [PERSISTENCE] Add Assistant Message to Store
                this.conversationStore.addMessage(chatId, "assistant", replyText);

                await this.reply(msgId, replyText);
                console.log(`Feishu: Repled to message ${msgId}`);
            } else {
                console.warn(`Feishu: Agent returned empty response for message ${msgId}`);
            }

        } catch (e) {
            console.error("Error running agent for Feishu message:", e);
            await this.reply(msgId, "Error: " + String(e));
        }
    }

    private async reply(messageId: string, content: string) {
        try {
            await this.client.im.message.reply({
                path: {
                    message_id: messageId,
                },
                data: {
                    content: JSON.stringify({ text: content }),
                    msg_type: "text",
                },
            });
        } catch (e) {
            console.error("Failed to reply to Feishu:", e);
        }
    }

    /**
     * 主动发送消息（非回复）
     * @param content - 消息内容
     * @param chatId - 可选，指定发送目标。不指定则发送到最后活跃的会话
     * @returns 是否发送成功
     */
    async sendProactiveMessage(content: string, chatId?: string): Promise<boolean> {
        const targetChatId = chatId || this.lastChatId;

        if (!targetChatId) {
            console.warn(`[${this.name}] Cannot send proactive message - no active chat ID found.`);
            return false;
        }

        try {
            await this.client.im.message.create({
                params: {
                    receive_id_type: "chat_id",
                },
                data: {
                    receive_id: targetChatId,
                    content: JSON.stringify({ text: content }),
                    msg_type: "text",
                },
            });
            console.log(`[${this.name}] Proactive message sent to ${targetChatId}`);
            return true;
        } catch (e) {
            console.error(`[${this.name}] Failed to send proactive message:`, e);
            return false;
        }
    }
}
