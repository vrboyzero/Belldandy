import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
export class NodeRunner {
    scratchDir;
    constructor(workspaceRoot) {
        this.scratchDir = path.join(workspaceRoot, ".belldandy", "scratchpad");
    }
    async run(code) {
        await fs.mkdir(this.scratchDir, { recursive: true });
        const filename = `script_${Date.now()}_${Math.random().toString(36).slice(2)}.js`;
        const filepath = path.join(this.scratchDir, filename);
        await fs.writeFile(filepath, code, "utf-8");
        return new Promise((resolve) => {
            const child = spawn("node", [filepath], {
                cwd: this.scratchDir,
            });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (d) => { stdout += d.toString(); });
            child.stderr.on("data", (d) => { stderr += d.toString(); });
            child.on("close", (code) => {
                resolve({ stdout, stderr });
            });
            child.on("error", (err) => {
                resolve({ stdout: "", stderr: `Spawn Error: ${err.message}` });
            });
        });
    }
}
//# sourceMappingURL=js.js.map