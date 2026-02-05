import os from "node:os";
import { spawn } from "node:child_process";
class MockPty {
    pid;
    process;
    child;
    constructor(file, args, opt) {
        this.process = file;
        this.child = spawn(file, args, {
            cwd: opt.cwd,
            env: opt.env,
            shell: false // We are spawning the shell itself
        });
        this.pid = this.child.pid || 0;
    }
    write(data) {
        if (this.child.stdin.writable) {
            this.child.stdin.write(data);
        }
    }
    resize(cols, rows) {
        // No-op for standard pipes
    }
    kill(signal) {
        this.child.kill(signal);
    }
    onData(listener) {
        this.child.stdout.on('data', (d) => listener(d.toString()));
        this.child.stderr.on('data', (d) => listener(d.toString()));
    }
    onExit(listener) {
        this.child.on('exit', (code, signal) => {
            listener({ exitCode: code || 0, signal: signal === null ? undefined : signal });
        });
    }
}
export class PtyManager {
    sessions = new Map();
    static instance;
    nodePtyModule = null;
    loadAttempted = false;
    constructor() { }
    static getInstance() {
        if (!PtyManager.instance) {
            PtyManager.instance = new PtyManager();
        }
        return PtyManager.instance;
    }
    async loadNodePty() {
        if (this.loadAttempted)
            return;
        this.loadAttempted = true;
        try {
            // Try to dynamically import node-pty
            const m = await import("node-pty");
            this.nodePtyModule = m.default || m;
            console.log("[PtyManager] node-pty loaded successfully.");
        }
        catch (e) {
            console.warn("[PtyManager] Failed to load node-pty, falling back to MockPty (child_process).", e);
        }
    }
    async createSession(cmd, args = [], opt = {}) {
        await this.loadNodePty();
        const id = Math.random().toString(36).substring(7);
        // 跨平台 shell 选择：Windows -> PowerShell, macOS/Linux -> 用户默认 shell 或 bash
        const shell = cmd || (os.platform() === "win32"
            ? "powershell.exe"
            : (process.env.SHELL || "/bin/bash"));
        const env = Object.assign({}, process.env, opt.env);
        const cwd = opt.cwd || process.cwd();
        let ptyProcess;
        if (this.nodePtyModule) {
            ptyProcess = this.nodePtyModule.spawn(shell, args, {
                name: "xterm-color",
                cols: opt.cols || 80,
                rows: opt.rows || 24,
                cwd,
                env,
            });
        }
        else {
            // Fallback
            ptyProcess = new MockPty(shell, args, { cwd, env });
        }
        const session = {
            id,
            process: ptyProcess,
            buffer: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
        };
        ptyProcess.onData((data) => {
            session.buffer.push(data);
            session.lastActivity = Date.now();
            if (session.buffer.length > 2000)
                session.buffer.shift();
        });
        ptyProcess.onExit((e) => {
            session.buffer.push(`\n[Process exited with code ${e.exitCode}]\n`);
        });
        this.sessions.set(id, session);
        return id;
    }
    // ... rest of methods are synchronous but session map lookup handles it
    resize(id, cols, rows) {
        const session = this.sessions.get(id);
        if (!session)
            throw new Error(`Session ${id} not found`);
        session.process.resize(cols, rows);
        session.lastActivity = Date.now();
    }
    write(id, data) {
        const session = this.sessions.get(id);
        if (!session)
            throw new Error(`Session ${id} not found`);
        session.process.write(data);
        session.lastActivity = Date.now();
    }
    read(id) {
        const session = this.sessions.get(id);
        if (!session)
            throw new Error(`Session ${id} not found`);
        const output = session.buffer.join("");
        session.buffer = [];
        session.lastActivity = Date.now();
        return output;
    }
    kill(id) {
        const session = this.sessions.get(id);
        if (session) {
            session.process.kill();
            this.sessions.delete(id);
        }
    }
    list() {
        return Array.from(this.sessions.values()).map(s => ({
            id: s.id,
            pid: s.process.pid,
            cmd: s.process.process
        }));
    }
}
//# sourceMappingURL=pty.js.map