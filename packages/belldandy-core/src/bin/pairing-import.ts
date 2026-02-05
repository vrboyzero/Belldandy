
import { readAllowlistStore, writeAllowlistStore, readPairingStore, writePairingStore, resolveStateDir } from "../security/store.js";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
    const args = process.argv.slice(2);
    const inFlagIndex = args.indexOf("--in");
    const modeFlagIndex = args.indexOf("--mode");

    // Usage: pairing-import --in <file> [--mode merge|replace]

    const inFile = inFlagIndex !== -1 ? args[inFlagIndex + 1] : undefined;
    const mode = modeFlagIndex !== -1 ? args[modeFlagIndex + 1] : "merge";

    if (!inFile) {
        console.error("Usage: pairing-import --in <file> [--mode merge|replace]");
        process.exit(1);
    }

    if (mode !== "merge" && mode !== "replace") {
        console.error("Invalid mode. Use 'merge' or 'replace'.");
        process.exit(1);
    }

    try {
        const absPath = path.resolve(process.cwd(), inFile);
        const raw = await fs.readFile(absPath, "utf-8");
        const data = JSON.parse(raw);

        if (!Array.isArray(data.allowlist)) {
            throw new Error("Invalid import file format: missing 'allowlist' array.");
        }

        const stateDir = resolveStateDir();
        console.log(`State Directory: ${stateDir}`);

        // Import Allowlist
        const currentAllow = await readAllowlistStore(stateDir);
        let newAllow = currentAllow.allowFrom;

        if (mode === "replace") {
            newAllow = data.allowlist;
        } else {
            // merge
            const set = new Set(currentAllow.allowFrom);
            for (const id of data.allowlist) {
                set.add(id);
            }
            newAllow = Array.from(set);
        }

        currentAllow.allowFrom = newAllow;
        await writeAllowlistStore(stateDir, currentAllow);
        console.log(`Imported allowlist (mode=${mode}). Total allowed: ${newAllow.length}`);

        // Import Pending (optional)
        if (Array.isArray(data.pending)) {
            const currentPending = await readPairingStore(stateDir);
            let newPending = currentPending.pending;

            if (mode === "replace") {
                newPending = data.pending;
            } else {
                // merge pending is tricky due to duplicate codes, but let's try
                // Strategy: Add if code doesn't exist
                const codeMap = new Map(currentPending.pending.map(p => [p.code, p]));
                for (const p of data.pending) {
                    if (!codeMap.has(p.code)) {
                        codeMap.set(p.code, p);
                    }
                }
                newPending = Array.from(codeMap.values());
            }

            currentPending.pending = newPending;
            await writePairingStore(stateDir, currentPending);
            console.log(`Imported pending requests (mode=${mode}). Total pending: ${newPending.length}`);
        }

    } catch (err: any) {
        console.error("Error importing data:", err.message);
        process.exit(1);
    }
}

main();
