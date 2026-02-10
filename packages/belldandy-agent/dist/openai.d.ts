import type { AgentRunInput, AgentStreamItem, BelldandyAgent } from "./index.js";
import { type ModelProfile, type FailoverLogger } from "./failover-client.js";
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
export declare class OpenAIChatAgent implements BelldandyAgent {
    private readonly opts;
    private readonly failoverClient;
    constructor(opts: OpenAIChatAgentOptions);
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}
//# sourceMappingURL=openai.d.ts.map