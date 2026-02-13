/**
 * 对话压缩（Compaction）模块
 *
 * 当对话历史超过 token 阈值时，将旧消息摘要化以减少 token 消耗。
 * 策略：保留最近 N 条消息原文，将更早的消息用模型生成摘要替换。
 */

// ─── Types ───────────────────────────────────────────────────────────────

export type CompactionOptions = {
  /** 触发压缩的 token 阈值（默认 12000） */
  tokenThreshold?: number;
  /** 压缩后保留的最近消息条数（默认 6） */
  keepRecentCount?: number;
  /** 安全余量系数（默认 1.2，即估算值 * 1.2） */
  safetyMargin?: number;
};

export type CompactionResult = {
  /** 压缩后的消息列表 */
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** 是否执行了压缩 */
  compacted: boolean;
  /** 压缩前估算 token 数 */
  originalTokens: number;
  /** 压缩后估算 token 数 */
  compactedTokens: number;
};

// ─── Token 估算 ─────────────────────────────────────────────────────────

const SAFETY_MARGIN = 1.2;

/**
 * 简单 token 估算：
 * - 英文/代码：约 4 字符 = 1 token
 * - 中文/日文：约 2 字符 = 1 token
 * - 混合内容取加权平均
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 统计 CJK 字符数
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g) || []).length;
  const nonCjkCount = text.length - cjkCount;
  return Math.ceil(cjkCount / 2 + nonCjkCount / 4);
}

/**
 * 估算消息列表的总 token 数（含安全余量）
 */
export function estimateMessagesTokens(
  messages: Array<{ role: string; content: string }>,
  margin: number = SAFETY_MARGIN,
): number {
  const raw = messages.reduce((sum, m) => sum + estimateTokens(m.content) + 4, 0); // +4 for role/formatting overhead
  return Math.ceil(raw * margin);
}

// ─── 压缩逻辑 ─────────────────────────────────────────────────────────

/**
 * 将消息列表压缩为摘要 + 最近消息。
 *
 * 不调用外部模型，使用纯文本截断摘要（轻量级方案）。
 * 如果需要模型摘要，可通过 summarizer 参数注入。
 */
export async function compactMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options?: CompactionOptions & {
    /** 可选：外部摘要函数（如用便宜模型生成摘要） */
    summarizer?: (messages: Array<{ role: string; content: string }>) => Promise<string>;
  },
): Promise<CompactionResult> {
  const threshold = options?.tokenThreshold ?? 12000;
  const keepRecent = options?.keepRecentCount ?? 6;
  const margin = options?.safetyMargin ?? SAFETY_MARGIN;

  const originalTokens = estimateMessagesTokens(messages, margin);

  // 不需要压缩
  if (originalTokens <= threshold || messages.length <= keepRecent) {
    return {
      messages,
      compacted: false,
      originalTokens,
      compactedTokens: originalTokens,
    };
  }

  // 分割：旧消息 + 最近消息
  const splitIndex = messages.length - keepRecent;
  const oldMessages = messages.slice(0, splitIndex);
  const recentMessages = messages.slice(splitIndex);

  // 生成摘要
  let summary: string;
  if (options?.summarizer) {
    try {
      summary = await options.summarizer(oldMessages);
    } catch {
      // 摘要失败，降级为文本截断
      summary = buildFallbackSummary(oldMessages);
    }
  } else {
    summary = buildFallbackSummary(oldMessages);
  }

  // 构建压缩后的消息列表
  const compactedMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    {
      role: "user" as const,
      content: `[Previous conversation summary (${oldMessages.length} messages compressed)]\n\n${summary}`,
    },
    {
      role: "assistant" as const,
      content: "Understood. I have the context from our previous conversation. Let me continue from where we left off.",
    },
    ...recentMessages,
  ];

  const compactedTokens = estimateMessagesTokens(compactedMessages, margin);

  return {
    messages: compactedMessages,
    compacted: true,
    originalTokens,
    compactedTokens,
  };
}

/**
 * 降级摘要：不调用模型，直接截取关键信息
 */
function buildFallbackSummary(
  messages: Array<{ role: string; content: string }>,
): string {
  const MAX_SUMMARY_CHARS = 2000;
  const lines: string[] = [];
  let totalChars = 0;

  for (const msg of messages) {
    const prefix = msg.role === "user" ? "User" : "Assistant";
    // 截取每条消息的前 200 字符
    const snippet = msg.content.length > 200
      ? msg.content.slice(0, 200) + "..."
      : msg.content;
    const line = `- ${prefix}: ${snippet}`;

    if (totalChars + line.length > MAX_SUMMARY_CHARS) {
      lines.push(`... (${messages.length - lines.length} more messages omitted)`);
      break;
    }

    lines.push(line);
    totalChars += line.length;
  }

  return lines.join("\n");
}

/**
 * 判断消息列表是否需要压缩
 */
export function needsCompaction(
  messages: Array<{ role: string; content: string }>,
  options?: CompactionOptions,
): boolean {
  const threshold = options?.tokenThreshold ?? 12000;
  const keepRecent = options?.keepRecentCount ?? 6;
  const margin = options?.safetyMargin ?? SAFETY_MARGIN;

  if (messages.length <= keepRecent) return false;
  return estimateMessagesTokens(messages, margin) > threshold;
}
