/**
 * 对话消息
 */
export type ConversationMessage = {
    role: "user" | "assistant";
    content: string;
    timestamp: number;
};

/**
 * 会话对象
 */
export type Conversation = {
    id: string;
    messages: ConversationMessage[];
    createdAt: number;
    updatedAt: number;
};

/**
 * 会话存储选项
 */
export type ConversationStoreOptions = {
    /** 最大历史消息数（默认 20） */
    maxHistory?: number;
    /** 会话过期时间（秒，默认 3600） */
    ttlSeconds?: number;
};

/**
 * 会话存储（内存实现）
 * 用于管理对话上下文历史
 */
export class ConversationStore {
    private conversations = new Map<string, Conversation>();
    private readonly maxHistory: number;
    private readonly ttlSeconds: number;

    constructor(options: ConversationStoreOptions = {}) {
        this.maxHistory = options.maxHistory ?? 20;
        this.ttlSeconds = options.ttlSeconds ?? 3600;
    }

    /**
     * 获取会话
     */
    get(id: string): Conversation | undefined {
        const conv = this.conversations.get(id);
        if (!conv) return undefined;

        // 检查过期
        const now = Date.now();
        if (now - conv.updatedAt > this.ttlSeconds * 1000) {
            this.conversations.delete(id);
            return undefined;
        }

        return conv;
    }

    /**
     * 添加消息到会话
     * 如果会话不存在会自动创建
     */
    addMessage(id: string, role: "user" | "assistant", content: string): void {
        let conv = this.get(id);
        const now = Date.now();

        if (!conv) {
            conv = {
                id,
                messages: [],
                createdAt: now,
                updatedAt: now,
            };
            this.conversations.set(id, conv);
        }

        conv.messages.push({ role, content, timestamp: now });
        conv.updatedAt = now;

        // 限制历史长度 (保留最新的 maxHistory 条)
        if (conv.messages.length > this.maxHistory) {
            const start = conv.messages.length - this.maxHistory;
            conv.messages = conv.messages.slice(start);
        }
    }

    /**
     * 清除会话
     */
    clear(id: string): void {
        this.conversations.delete(id);
    }

    /**
     * 获取最近的历史消息（用于传给 LLM）
     * 不包含当前的最新消息，仅返回之前的历史
     */
    getHistory(id: string): Array<{ role: "user" | "assistant"; content: string }> {
        const conv = this.get(id);
        if (!conv) return [];

        // 返回纯净的消息对象
        return conv.messages.map(m => ({
            role: m.role,
            content: m.content
        }));
    }
}
