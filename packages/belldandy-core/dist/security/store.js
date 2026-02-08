import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_TTL_MS = 60 * 60 * 1000;
const PAIRING_MAX_PENDING = 20;
export function resolveStateDir(env = process.env) {
    const v = env.BELLDANDY_STATE_DIR;
    if (v && v.trim())
        return v.trim();
    return path.join(os.homedir(), ".belldandy");
}
export function resolveAllowlistPath(stateDir) {
    return path.join(stateDir, "allowlist.json");
}
export function resolvePairingPath(stateDir) {
    return path.join(stateDir, "pairing.json");
}
export async function isClientAllowed(params) {
    const stateDir = params.stateDir ?? resolveStateDir(params.env);
    const store = await readAllowlistStore(stateDir);
    return store.allowFrom.includes(params.clientId);
}
export async function approvePairingCode(params) {
    const stateDir = params.stateDir ?? resolveStateDir(params.env);
    const pairing = await readPairingStore(stateDir);
    const match = pairing.pending.find((p) => p.code === params.code);
    if (!match)
        return { ok: false, message: "pairing code not found or expired" };
    const allowlist = await readAllowlistStore(stateDir);
    if (!allowlist.allowFrom.includes(match.clientId)) {
        allowlist.allowFrom.push(match.clientId);
    }
    await writeAllowlistStore(stateDir, allowlist);
    pairing.pending = pairing.pending.filter((p) => p.code !== params.code);
    await writePairingStore(stateDir, pairing);
    return { ok: true, clientId: match.clientId };
}
export async function revokeClient(params) {
    const stateDir = params.stateDir ?? resolveStateDir(params.env);
    const allowlist = await readAllowlistStore(stateDir);
    const before = allowlist.allowFrom.length;
    allowlist.allowFrom = allowlist.allowFrom.filter((id) => id !== params.clientId);
    await writeAllowlistStore(stateDir, allowlist);
    return { ok: true, removed: allowlist.allowFrom.length !== before };
}
export async function ensurePairingCode(params) {
    const stateDir = params.stateDir ?? resolveStateDir(params.env);
    const store = await readPairingStore(stateDir);
    const now = Date.now();
    store.pending = store.pending.filter((p) => now - Date.parse(p.createdAt) <= PAIRING_TTL_MS);
    const existing = store.pending.find((p) => p.clientId === params.clientId);
    if (existing) {
        await writePairingStore(stateDir, store);
        return { code: existing.code, createdAt: existing.createdAt };
    }
    const used = new Set(store.pending.map((p) => p.code));
    const code = generateUniqueCode(used);
    const createdAt = new Date().toISOString();
    store.pending.push({ clientId: params.clientId, code, createdAt });
    if (store.pending.length > PAIRING_MAX_PENDING) {
        store.pending = store.pending.slice(-PAIRING_MAX_PENDING);
    }
    await writePairingStore(stateDir, store);
    return { code, createdAt };
}
export async function cleanupPending(params) {
    const stateDir = params.stateDir ?? resolveStateDir(params.env);
    const store = await readPairingStore(stateDir);
    const now = Date.now();
    const valid = [];
    const expired = [];
    for (const p of store.pending) {
        if (now - Date.parse(p.createdAt) <= PAIRING_TTL_MS) {
            valid.push(p);
        }
        else {
            expired.push(p);
        }
    }
    if (expired.length > 0 && !params.dryRun) {
        store.pending = valid;
        await writePairingStore(stateDir, store);
    }
    return { cleaned: expired, remaining: valid.length };
}
export async function readAllowlistStore(stateDir) {
    const filePath = resolveAllowlistPath(stateDir);
    const fallback = { version: 1, allowFrom: [] };
    return await readJson(filePath, fallback);
}
export async function writeAllowlistStore(stateDir, store) {
    const filePath = resolveAllowlistPath(stateDir);
    await writeJson(filePath, store);
}
export async function readPairingStore(stateDir) {
    const filePath = resolvePairingPath(stateDir);
    const fallback = { version: 1, pending: [] };
    return await readJson(filePath, fallback);
}
export async function writePairingStore(stateDir, store) {
    const filePath = resolvePairingPath(stateDir);
    await writeJson(filePath, store);
}
async function readJson(filePath, fallback) {
    try {
        const raw = await fs.promises.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return (parsed ?? fallback);
    }
    catch (err) {
        const code = err.code;
        if (code === "ENOENT")
            return fallback;
        return fallback;
    }
}
const RENAME_RETRIES = 3;
const RENAME_RETRY_DELAY_MS = 50;
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function writeJson(filePath, value) {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    const tmp = path.join(dir, `${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
    const content = `${JSON.stringify(value, null, 2)}\n`;
    await fs.promises.writeFile(tmp, content, "utf-8");
    try {
        await fs.promises.chmod(tmp, 0o600);
    }
    catch {
        /* Windows 可能不支持 chmod，忽略 */
    }
    let lastErr = null;
    for (let i = 0; i < RENAME_RETRIES; i++) {
        try {
            await fs.promises.rename(tmp, filePath);
            return;
        }
        catch (err) {
            lastErr = err;
            if (i < RENAME_RETRIES - 1)
                await delay(RENAME_RETRY_DELAY_MS);
        }
    }
    // Windows 上 rename 常因占用/权限报 EPERM，降级为直接写目标文件
    if (process.platform === "win32" && lastErr && (lastErr.code === "EPERM" || lastErr.code === "EBUSY")) {
        try {
            await fs.promises.writeFile(filePath, content, "utf-8");
            await fs.promises.unlink(tmp).catch(() => { });
            return;
        }
        catch (fallbackErr) {
            await fs.promises.unlink(tmp).catch(() => { });
            throw fallbackErr;
        }
    }
    await fs.promises.unlink(tmp).catch(() => { });
    throw lastErr;
}
function randomCode() {
    let out = "";
    for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
        const idx = crypto.randomInt(0, PAIRING_CODE_ALPHABET.length);
        out += PAIRING_CODE_ALPHABET[idx];
    }
    return out;
}
function generateUniqueCode(existing) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        const code = randomCode();
        if (!existing.has(code))
            return code;
    }
    throw new Error("failed to generate unique pairing code");
}
//# sourceMappingURL=store.js.map