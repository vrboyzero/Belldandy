import { type BelldandyAgent } from "@belldandy/agent";
import type { GatewayEventFrame } from "@belldandy/protocol";
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
};
export type GatewayServer = {
    port: number;
    host: string;
    close: () => Promise<void>;
    broadcast: (frame: GatewayEventFrame) => void;
};
export declare function startGatewayServer(opts: GatewayServerOptions): Promise<GatewayServer>;
//# sourceMappingURL=server.d.ts.map