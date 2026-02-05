/**
 * 会话存储（内存实现）
 * 用于管理对话上下文历史
 */
export class ConversationStore {
    conversations = new Map();
    maxHistory;
    ttlSeconds;
    constructor(options = {}) {
        this.maxHistory = options.maxHistory ?? 20;
        this.ttlSeconds = options.ttlSeconds ?? 3600;
    }
    /**
     * 获取会话
     */
    get(id) {
        const conv = this.conversations.get(id);
        if (!conv)
            return undefined;
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
    addMessage(id, role, content) {
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
    clear(id) {
        this.conversations.delete(id);
    }
    /**
     * 获取最近的历史消息（用于传给 LLM）
     * 不包含当前的最新消息，仅返回之前的历史
     */
    getHistory(id) {
        const conv = this.get(id);
        if (!conv)
            return [];
        // 返回纯净的消息对象
        return conv.messages.map(m => ({
            role: m.role,
            content: m.content
        }));
    }
}
//# sourceMappingURL=conversation.js.map