import type { JsonObject } from "@belldandy/protocol";

import type { AgentRunInput, AgentStreamItem, BelldandyAgent } from "./index.js";
import { FailoverClient, type ModelProfile, type FailoverLogger } from "./failover-client.js";

export type OpenAIChatAgentOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  stream?: boolean;
  systemPrompt?: string;
  /** 备用 Profile 列表（模型容灾） */
  fallbacks?: ModelProfile[];
  /** 容灾日志接口 */
  failoverLogger?: FailoverLogger;
};

export class OpenAIChatAgent implements BelldandyAgent {
  private readonly opts: Required<Pick<OpenAIChatAgentOptions, "timeoutMs" | "stream">> &
    Omit<OpenAIChatAgentOptions, "timeoutMs" | "stream">;
  private readonly failoverClient: FailoverClient;

  constructor(opts: OpenAIChatAgentOptions) {
    this.opts = {
      ...opts,
      timeoutMs: opts.timeoutMs ?? 60_000,
      stream: opts.stream ?? true,
    };

    // 初始化容灾客户端
    this.failoverClient = new FailoverClient({
      primary: { id: "primary", baseUrl: opts.baseUrl, apiKey: opts.apiKey, model: opts.model },
      fallbacks: opts.fallbacks,
      logger: opts.failoverLogger,
    });
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentStreamItem> {
    yield { type: "status", status: "running" };

    try {
      const content = input.content || input.text;
      const messages = buildMessages(this.opts.systemPrompt, content, input.history);

      // 使用容灾客户端发送请求
      const { response: res } = await this.failoverClient.fetchWithFailover({
        timeoutMs: this.opts.timeoutMs,
        buildRequest: (profile) => {
          const payload = {
            model: profile.model,
            messages,
            stream: this.opts.stream,
          };
          return {
            url: buildUrl(profile.baseUrl, "/chat/completions"),
            init: {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${profile.apiKey}`,
              },
              body: JSON.stringify(payload),
            },
          };
        },
      });

      if (!res.ok) {
        const text = await safeReadText(res);
        yield { type: "final", text: `模型调用失败（HTTP ${res.status}）：${text}` };
        yield { type: "status", status: "error" };
        return;
      }

      if (!this.opts.stream) {
        const json = (await res.json()) as JsonObject;
        const content = getNonStreamContent(json) ?? "";
        yield* emitChunkedFinal(content);
        return;
      }

      const body = res.body;
      if (!body) {
        yield { type: "final", text: "模型调用失败：响应体为空" };
        yield { type: "status", status: "error" };
        return;
      }

      let out = "";
      for await (const item of parseSseStream(body)) {
        if (item.type === "delta") {
          out += item.delta;
          yield item;
        }
        if (item.type === "final") {
          yield { type: "final", text: out };
          yield { type: "status", status: "done" };
          return;
        }
        if (item.type === "error") {
          yield { type: "final", text: item.message };
          yield { type: "status", status: "error" };
          return;
        }
      }

      yield { type: "final", text: out };
      yield { type: "status", status: "done" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: "final", text: `模型调用异常：${msg}` };
      yield { type: "status", status: "error" };
    }
  }
}

function buildMessages(
  systemPrompt: string | undefined,
  userContent: string | Array<any>, // using any to avoid circular dependency issues or just treating as opaque json
  history?: Array<{ role: "user" | "assistant"; content: string | Array<any> }>,
) {
  const messages: Array<{ role: "system" | "user" | "assistant"; content: any }> = [];

  // Layer 1: System
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }

  // Layer 2: History
  if (history && history.length > 0) {
    messages.push(...history);
  }

  // Layer 3: Current User Message
  messages.push({ role: "user", content: userContent });

  return messages;
}

function buildUrl(baseUrl: string, endpoint: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  // 已包含版本号路径（/v1, /v4 等）则不再追加
  const base = /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
  return `${base}${endpoint}`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.length > 500 ? `${text.slice(0, 500)}…` : text;
  } catch {
    return "";
  }
}

function getNonStreamContent(json: JsonObject): string | null {
  const choices = (json.choices as unknown) as Array<any> | undefined;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content : null;
}

async function* emitChunkedFinal(text: string): AsyncIterable<AgentStreamItem> {
  const chunks = splitText(text, 16);
  let out = "";
  for (const delta of chunks) {
    out += delta;
    yield { type: "delta", delta };
  }
  yield { type: "final", text: out };
  yield { type: "status", status: "done" };
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

type ParsedSseItem =
  | { type: "delta"; delta: string }
  | { type: "final" }
  | { type: "error"; message: string };

async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncIterable<ParsedSseItem> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const idx = buffer.indexOf("\n\n");
      if (idx < 0) break;
      const eventBlock = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      const dataLines = eventBlock
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice("data:".length).trim());

      for (const data of dataLines) {
        if (data === "[DONE]") {
          yield { type: "final" };
          return;
        }
        try {
          const json = JSON.parse(data) as any;
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length) {
            yield { type: "delta", delta };
          }
        } catch {
          yield { type: "error", message: "模型流解析失败" };
          return;
        }
      }
    }
  }
}

