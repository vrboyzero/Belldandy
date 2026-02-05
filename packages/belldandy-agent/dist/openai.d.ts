import type { AgentRunInput, AgentStreamItem, BelldandyAgent } from "./index.js";
export type OpenAIChatAgentOptions = {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs?: number;
    stream?: boolean;
    systemPrompt?: string;
};
export declare class OpenAIChatAgent implements BelldandyAgent {
    private readonly opts;
    constructor(opts: OpenAIChatAgentOptions);
    run(input: AgentRunInput): AsyncIterable<AgentStreamItem>;
}
//# sourceMappingURL=openai.d.ts.map