import { type BelldandyAgent } from "@belldandy/agent";
import type { GatewayEventFrame } from "@belldandy/protocol";
import type { BelldandyLogger } from "./logger/index.js";
export type GatewayServerOptions = {
    port: number;
    host?: string;
    auth: {
        mode: "none" | "token" | "password";
        token?: string;
        password?: string;
    };
    webRoot: string;
    stateDir?: string;
    agentFactory?: () => BelldandyAgent;
    conversationStoreOptions?: {
        maxHistory?: number;
        ttlSeconds?: number;
    };
    onActivity?: () => void;
    /** 可选：统一 Logger，未提供时使用 console */
    logger?: BelldandyLogger;
};
export type GatewayServer = {
    port: number;
    host: string;
    close: () => Promise<void>;
    broadcast: (frame: GatewayEventFrame) => void;
};
export declare function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer>;
//# sourceMappingURL=server.d.ts.map