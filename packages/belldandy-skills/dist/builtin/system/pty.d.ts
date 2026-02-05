export interface IPty {
    pid: number;
    process: string;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    onData(listener: (data: string) => void): void;
    onExit(listener: (e: {
        exitCode: number;
        signal?: number;
    }) => void): void;
}
export declare class PtyManager {
    private sessions;
    private static instance;
    private nodePtyModule;
    private loadAttempted;
    private constructor();
    static getInstance(): PtyManager;
    private loadNodePty;
    createSession(cmd: string, args?: string[], opt?: {
        cwd?: string;
        env?: Record<string, string>;
        cols?: number;
        rows?: number;
    }): Promise<string>;
    resize(id: string, cols: number, rows: number): void;
    write(id: string, data: string): void;
    read(id: string): string;
    kill(id: string): void;
    list(): {
        id: string;
        pid: number;
        cmd: string;
    }[];
}
//# sourceMappingURL=pty.d.ts.map