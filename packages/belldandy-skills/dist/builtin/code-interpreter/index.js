import { PythonRunner } from "./python.js";
import { NodeRunner } from "./js.js";
import crypto from "node:crypto";
export const codeInterpreterTool = {
    definition: {
        name: "code_interpreter",
        description: "Execute Python or Node.js code in a temporary environment. Useful for calculations, data analysis, or generating text output via scripts. NOT a REPL (stateless per call, unless you write to files).",
        parameters: {
            type: "object",
            properties: {
                language: {
                    type: "string",
                    enum: ["python", "javascript"],
                    description: "Programming language to use.",
                },
                code: {
                    type: "string",
                    description: "The source code to execute.",
                },
            },
            required: ["language", "code"],
        },
    },
    async execute(args, context) {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "code_interpreter";
        const lang = args.language;
        const code = args.code;
        try {
            let result;
            if (lang === "python") {
                const runner = new PythonRunner(context.workspaceRoot);
                result = await runner.run(code);
            }
            else if (lang === "javascript") {
                const runner = new NodeRunner(context.workspaceRoot);
                result = await runner.run(code);
            }
            else {
                throw new Error(`Unsupported language: ${lang}`);
            }
            return {
                id,
                name,
                success: result.stderr.length === 0, // Consider usage of stderr as 'failure' or just part of output? Usually scripts use stderr for errors.
                output: result.stdout + (result.stderr ? `\n[STDERR]\n${result.stderr}` : ""),
                durationMs: Date.now() - start,
            };
        }
        catch (err) {
            return {
                id,
                name,
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
                durationMs: Date.now() - start,
            };
        }
    },
};
//# sourceMappingURL=index.js.map