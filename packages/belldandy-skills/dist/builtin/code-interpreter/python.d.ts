export declare class PythonRunner {
    private scratchDir;
    constructor(workspaceRoot: string);
    run(code: string): Promise<{
        stdout: string;
        stderr: string;
    }>;
}
//# sourceMappingURL=python.d.ts.map