import fs from "node:fs";
import path from "node:path";

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
    /** 持久化存储目录 (可选) */
    dataDir?: string;
};

/**
 * 会话存储
 * 用于管理对话上下文历史，支持文件持久化 (JSONL)
 */
export class ConversationStore {
    private conversations = new Map<string, Conversation>();
    private readonly maxHistory: number;
    private readonly ttlSeconds: number;
    private readonly dataDir?: string;

    constructor(options: ConversationStoreOptions = {}) {
        this.maxHistory = options.maxHistory ?? 20;
        this.ttlSeconds = options.ttlSeconds ?? 3600;
        this.dataDir = options.dataDir;

        if (this.dataDir) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    /**
     * 获取会话
     * 优先从内存获取，若无则尝试从文件加载
     */
    get(id: string): Conversation | undefined {
        let conv = this.conversations.get(id);

        // 如果内存没有，尝试从磁盘加载
        if (!conv && this.dataDir) {
            conv = this.loadFromFile(id);
        }

        if (!conv) return undefined;

        // 检查过期 (仅针对纯内存或缓存策略，持久化后可适当放宽，但保持语义一致)
        const now = Date.now();
        if (now - conv.updatedAt > this.ttlSeconds * 1000) {
            this.conversations.delete(id);
            return undefined;
        }

        // 加载后放入内存缓存
        if (!this.conversations.has(id)) {
            this.conversations.set(id, conv);
        }

        return conv;
    }

    /**
     * 从文件加载会话
     */
    private loadFromFile(id: string): Conversation | undefined {
        if (!this.dataDir) return undefined;
        const filePath = path.join(this.dataDir, `${id}.jsonl`);
        if (!fs.existsSync(filePath)) return undefined;

        try {
            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n").filter(line => line.trim());
            const messages: ConversationMessage[] = [];
            let createdAt = Date.now();
            let updatedAt = 0;

            for (const line of lines) {
                try {
                    const msg = JSON.parse(line) as ConversationMessage;
                    if (msg.role && msg.content) {
                        messages.push(msg);
                        if (msg.timestamp > updatedAt) updatedAt = msg.timestamp;
                        if (msg.timestamp < createdAt) createdAt = msg.timestamp;
                    }
                } catch {
                    // ignore invalid lines
                }
            }

            if (messages.length === 0) return undefined;

            // 应用 maxHistory 限制 (加载时也裁剪)
            const finalMessages = messages.length > this.maxHistory
                ? messages.slice(messages.length - this.maxHistory)
                : messages;

            return {
                id,
                messages: finalMessages,
                createdAt,
                updatedAt: updatedAt || Date.now(),
            };
        } catch (err) {
            console.error(`Failed to load conversation ${id}:`, err);
            return undefined;
        }
    }

    /**
     * 添加消息到会话
     * 如果会话不存在会自动创建
     */
    addMessage(id: string, role: "user" | "assistant", content: string): void {
        let conv = this.get(id); // get() now handles loadFromFile
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

        const newMessage: ConversationMessage = { role, content, timestamp: now };
        conv.messages.push(newMessage);
        conv.updatedAt = now;

        // 限制内存中的历史长度
        if (conv.messages.length > this.maxHistory) {
            const start = conv.messages.length - this.maxHistory;
            conv.messages = conv.messages.slice(start);
        }

        // 持久化追加
        if (this.dataDir) {
            this.appendToFile(id, newMessage);
        }
    }

    /**
     * 追加消息到文件
     */
    private appendToFile(id: string, message: ConversationMessage): void {
        if (!this.dataDir) return;
        const filePath = path.join(this.dataDir, `${id}.jsonl`);
        const line = JSON.stringify(message) + "\n";

        // 异步写入，不阻塞主线程
        fs.appendFile(filePath, line, "utf-8", (err) => {
            if (err) {
                console.error(`Failed to append to conversation ${id}:`, err);
            }
        });
    }

    /**
     * 清除会话
     */
    clear(id: string): void {
        this.conversations.delete(id);
        // 可选：是否删除文件？通常保留作为历史记录
        // if (this.dataDir) {
        //     const filePath = path.join(this.dataDir, `${id}.jsonl`);
        //     if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        // }
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
