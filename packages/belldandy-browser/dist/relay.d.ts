export declare class RelayServer {
    private server;
    private wssExtension;
    private wssCdp;
    private extensionWs;
    private cdpClients;
    private pending;
    private nextId;
    readonly port: number;
    constructor(port?: number);
    private setupExtensionServer;
    private setupCdpServer;
    private handleExtensionMessage;
    private handleCdpCommand;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=relay.d.ts.map