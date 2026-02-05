import { describe, it, expect } from "vitest";
import { ConversationStore } from "./conversation.js";

describe("ConversationStore", () => {
    it("should add and retrieve messages", () => {
        const store = new ConversationStore();
        const id = "test-conv";

        store.addMessage(id, "user", "Hello");
        store.addMessage(id, "assistant", "Hi there");

        const history = store.getHistory(id);
        expect(history).toHaveLength(2);
        expect(history[0]).toEqual({ role: "user", content: "Hello" });
        expect(history[1]).toEqual({ role: "assistant", content: "Hi there" });
    });

    it("should respect maxHistory limit", () => {
        const store = new ConversationStore({ maxHistory: 2 });
        const id = "test-limit";

        store.addMessage(id, "user", "1");
        store.addMessage(id, "assistant", "2");
        store.addMessage(id, "user", "3");

        const history = store.getHistory(id);
        expect(history).toHaveLength(2);
        expect(history[0]).toEqual({ role: "assistant", content: "2" });
        expect(history[1]).toEqual({ role: "user", content: "3" });
    });

    it("should respect TTL", async () => {
        // TTL 0.01 seconds
        const store = new ConversationStore({ ttlSeconds: 0.01 });
        const id = "test-ttl";

        store.addMessage(id, "user", "Hi");

        // Wait for expiration
        await new Promise(r => setTimeout(r, 20));

        const history = store.getHistory(id);
        expect(history).toHaveLength(0);
    });
});
