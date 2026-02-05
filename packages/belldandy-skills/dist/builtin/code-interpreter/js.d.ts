export declare class NodeRunner {
    private scratchDir;
    constructor(workspaceRoot: string);
    run(code: string): Promise<{
        stdout: string;
        stderr: string;
    }>;
}
//# sourceMappingURL=js.d.ts.map