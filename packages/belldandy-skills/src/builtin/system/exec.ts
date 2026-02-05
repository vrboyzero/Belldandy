import type { Tool, ToolCallResult } from "../../types.js";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";

// 安全策略配置
const BLOCKLIST = new Set([
    "sudo", "su", "mkfs", "dd", "shutdown", "reboot", "poweroff", "init",
    ":(){:|:&};:" // Fork bomb
]);

// 通用命令（所有平台）
const COMMON_SAFELIST = [
    "pwd", "whoami", "date", "echo", "cat", "grep", "head", "tail",
    "git", "npm", "pnpm", "node", "yarn", "bun",
    "touch", "mkdir", "cp", "mv", "rmdir",
    "ps", "df", "du"
];

// Unix 特定命令 (Linux + macOS)
const UNIX_SAFELIST = [
    "ls", "top", "free", "chmod", "chown", "ln", "which", "find", "xargs",
    "curl", "wget", "tar", "gzip", "gunzip", "zip", "unzip",
    "open"  // macOS 特有：打开文件/URL
];

// Windows 特定命令
const WINDOWS_SAFELIST = [
    "dir", "copy", "move", "del", "ren", "type", 
    "ipconfig", "netstat", "tasklist", "where",
    "start"  // Windows 特有：打开文件/URL
];

// 根据平台构建白名单
function buildSafelist(): Set<string> {
    const list = [...COMMON_SAFELIST];
    if (process.platform === "win32") {
        list.push(...WINDOWS_SAFELIST);
    } else {
        // macOS (darwin) 和 Linux 共享 Unix 命令
        list.push(...UNIX_SAFELIST);
    }
    return new Set(list);
}

const SAFELIST = buildSafelist();

// 风险参数检测
const RISKY_ARGS = [
    { cmd: "rm", args: ["-r", "-f", "-rf", "-fr"], msg: "Recursive/Force deletion is blocked. Use file tools." }
];

function validateCommand(cmd: string): { valid: boolean; reason?: string } {
    const trimmed = cmd.trim();
    if (!trimmed) return { valid: false, reason: "Empty command" };

    // 1. 拆分命令 (简单拆分，不处理复杂引号引用，优先保证安全)
    const parts = trimmed.split(/\s+/);
    const executable = parts[0].toLowerCase(); // Windows 命令不区分大小写，统一转小写判断

    // 2. 检查黑名单
    if (BLOCKLIST.has(executable)) {
        return { valid: false, reason: `Command '${executable}' is blocked by security policy.` };
    }

    // 3. 检查白名单
    // 注意：如果我们不在白名单中，默认拒绝（Strict Mode）
    // 或者：如果不严格，可以放行非黑名单。考虑到用户要求"普通用户模式"，建议只放行常见开发工具。
    // 为了灵活性，我们允许绝对路径执行（只要不是黑名单），但给出警告日志？
    // 不，MVP 阶段严格一点：只允许 SAFELIST 内的命令 或者 看起来像本地脚本的 (./script.sh)
    const isLocalScript = executable.startsWith("./") || executable.startsWith("../") || executable.endsWith(".sh") || executable.endsWith(".js");

    if (!SAFELIST.has(executable) && !isLocalScript) {
        // 允许 rm/del 但要检查参数
        if (executable === "rm" || executable === "del") {
            // pass to arg check
        } else {
            return { valid: false, reason: `Command '${executable}' is not in the safe list.` };
        }
    }

    // 4. 检查参数风险
    // 针对 rm
    if (executable === "rm") {
        const args = parts.slice(1).join(" ");
        if (args.includes("-r") || args.includes("-R") || args.includes("-f") || args.includes("-F")) {
            return { valid: false, reason: "Recursive/Force deletion with 'rm' is blocked. Please use 'delete_file' tool or manual verification." };
        }
    }
    
    // 针对 del (Windows)
    if (executable === "del") {
        const args = parts.slice(1).join(" ").toLowerCase();
        // /s (recursive), /q (quiet mode), /f (force) - Windows style
        if (args.includes("/s") || args.includes("/q") || args.includes("/f")) {
            return { valid: false, reason: "Recursive/Queit deletion with 'del' is blocked. Please use 'delete_file' tool or manual verification." };
        }
    }

    // 5. 检查管道/重定向中的高危操作 (简单检查)
    // 如果包含 sudo 即使在中间也不行
    if (trimmed.includes(" sudo ")) {
        return { valid: false, reason: "Command contains 'sudo' which is forbidden." };
    }

    return { valid: true };
}

export const runCommandTool: Tool = {
    definition: {
        name: "run_command",
        description: "在宿主机执行 Shell 命令。仅允许安全列表内的开发工具 (git, npm, ls, etc.)。**禁止** sudo, mkfs 等高危操作。",
        parameters: {
            type: "object",
            properties: {
                command: {
                    type: "string",
                    description: "要执行的 Shell 命令",
                },
                cwd: {
                    type: "string",
                    description: "工作目录（可选，默认工作区根目录）",
                },
                timeoutMs: {
                    type: "number",
                    description: "超时时间（毫秒），默认 5000",
                },
            },
            required: ["command"],
        },
    },

    async execute(args, context): Promise<ToolCallResult> {
        const start = Date.now();
        const id = crypto.randomUUID();
        const name = "run_command";

        const makeResult = (success: boolean, output: string, error?: string): ToolCallResult => ({
            id,
            name,
            success,
            output,
            error,
            durationMs: Date.now() - start,
        });

        const command = args.command as string;
        if (!command || typeof command !== "string") {
            return makeResult(false, "", "Command is required");
        }

        // 安全验证
        const validation = validateCommand(command);
        if (!validation.valid) {
            context.logger?.warn(`[Security Block] ${command} -> ${validation.reason}`);
            return makeResult(false, "", `Security Error: ${validation.reason}`);
        }

        const cwd = args.cwd ? path.resolve(context.workspaceRoot, args.cwd as string) : context.workspaceRoot;
        const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 5000;

        context.logger?.info(`[exec] Run: ${command} in ${cwd}`);

        return new Promise((resolve) => {
            const child = spawn(command, {
                cwd,
                shell: true,
                env: { ...process.env, FORCE_COLOR: "0" }, // 禁用颜色代码
            });

            let stdout = "";
            let stderr = "";

            const timeoutTimer = setTimeout(() => {
                child.kill();
                resolve(makeResult(false, stdout, `Timeout after ${timeoutMs}ms\nStderr: ${stderr}`));
            }, timeoutMs);

            child.stdout.on("data", (data) => {
                stdout += data.toString();
            });

            child.stderr.on("data", (data) => {
                stderr += data.toString();
            });

            child.on("close", (code) => {
                clearTimeout(timeoutTimer);
                if (code === 0) {
                    resolve(makeResult(true, stdout));
                } else {
                    resolve(makeResult(false, stdout, `Process exited with code ${code}\nStderr: ${stderr}`));
                }
            });

            child.on("error", (err) => {
                clearTimeout(timeoutTimer);
                resolve(makeResult(false, stdout, `Spawn error: ${err.message}`));
            });
        });
    },
};
