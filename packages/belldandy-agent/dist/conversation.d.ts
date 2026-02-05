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
export declare class ConversationStore {
    private conversations;
    private readonly maxHistory;
    private readonly ttlSeconds;
    constructor(options?: ConversationStoreOptions);
    /**
     * 获取会话
     */
    get(id: string): Conversation | undefined;
    /**
     * 添加消息到会话
     * 如果会话不存在会自动创建
     */
    addMessage(id: string, role: "user" | "assistant", content: string): void;
    /**
     * 清除会话
     */
    clear(id: string): void;
    /**
     * 获取最近的历史消息（用于传给 LLM）
     * 不包含当前的最新消息，仅返回之前的历史
     */
    getHistory(id: string): Array<{
        role: "user" | "assistant";
        content: string;
    }>;
}
//# sourceMappingURL=conversation.d.ts.map