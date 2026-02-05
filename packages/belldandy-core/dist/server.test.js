import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import WebSocket from "ws";
import { startGatewayServer } from "./server.js";
import { approvePairingCode } from "./security/store.js";
function resolveWebRoot() {
    return path.join(process.cwd(), "apps", "web", "public");
}
test("gateway handshake and message.send streams chat", async () => {
    const stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-test-"));
    const server = await startGatewayServer({
        port: 0,
        auth: { mode: "none" },
        webRoot: resolveWebRoot(),
        stateDir,
    });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const frames = [];
    const closeP = new Promise((resolve) => ws.once("close", () => resolve()));
    ws.on("message", (data) => {
        frames.push(JSON.parse(data.toString("utf-8")));
    });
    await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
    ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "none" } }));
    await waitFor(() => frames.some((f) => f.type === "hello-ok"));
    const reqId = "req-1";
    ws.send(JSON.stringify({ type: "req", id: reqId, method: "message.send", params: { text: "你好" } }));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "pairing.required"));
    const pairing = frames.find((f) => f.type === "event" && f.event === "pairing.required");
    const code = pairing?.payload?.code ? String(pairing.payload.code) : "";
    expect(code.length).toBeGreaterThan(0);
    const approved = await approvePairingCode({ code, stateDir });
    expect(approved.ok).toBe(true);
    const reqId2 = "req-2";
    ws.send(JSON.stringify({ type: "req", id: reqId2, method: "message.send", params: { text: "你好" } }));
    await waitFor(() => frames.some((f) => f.type === "res" && f.id === reqId2 && f.ok === true));
    await waitFor(() => frames.some((f) => f.type === "event" && f.event === "chat.final"));
    const final = frames.find((f) => f.type === "event" && f.event === "chat.final");
    expect(final.payload.text).toContain("你好");
    ws.close();
    await closeP;
    await server.close();
    await fs.promises.rm(stateDir, { recursive: true, force: true });
});
test("gateway rejects invalid token", async () => {
    const server = await startGatewayServer({
        port: 0,
        auth: { mode: "token", token: "t" },
        webRoot: resolveWebRoot(),
    });
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const frames = [];
    ws.on("message", (data) => frames.push(JSON.parse(data.toString("utf-8"))));
    const closeP = new Promise((resolve) => {
        ws.once("close", (code, reason) => resolve({ code, reason: reason.toString("utf-8") }));
    });
    await waitFor(() => frames.some((f) => f.type === "connect.challenge"));
    ws.send(JSON.stringify({ type: "connect", role: "web", auth: { mode: "token", token: "wrong" } }));
    const closeInfo = await closeP;
    expect(closeInfo.code).toBe(4403);
    await server.close();
});
async function waitFor(predicate, timeoutMs = 3000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        if (predicate())
            return;
        await sleep(10);
    }
    throw new Error("timeout");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=server.test.js.map