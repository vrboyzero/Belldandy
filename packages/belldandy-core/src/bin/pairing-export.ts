
import { readAllowlistStore, readPairingStore, resolveStateDir } from "../security/store.js";
import fs from "node:fs/promises";
import path from "node:path";

async function main() {
    const args = process.argv.slice(2);
    const jsonFlagIndex = args.indexOf("--json"); // --json to stdout
    const outFlagIndex = args.indexOf("--out");

    // Usage: pairing-export [--out <file>] [--include-pending]

    const outFile = outFlagIndex !== -1 ? args[outFlagIndex + 1] : undefined;
    const includePending = args.includes("--include-pending");
    const toJson = jsonFlagIndex !== -1;

    if (!outFile && !toJson) {
        console.error("Usage: pairing-export --out <file> [--include-pending] OR pairing-export --json");
        process.exit(1);
    }

    try {
        const stateDir = resolveStateDir();
        const allowlist = await readAllowlistStore(stateDir);

        const exportData: any = {
            allowlist: allowlist.allowFrom,
            exportedAt: new Date().toISOString(),
        };

        if (includePending) {
            const pairing = await readPairingStore(stateDir);
            exportData.pending = pairing.pending;
        }

        const output = JSON.stringify(exportData, null, 2);

        if (toJson) {
            console.log(output);
        } else if (outFile) {
            const absPath = path.resolve(process.cwd(), outFile);
            await fs.writeFile(absPath, output, "utf-8");
            console.log(`Exported to ${absPath}`);
        }

    } catch (err: any) {
        console.error("Error exporting data:", err.message);
        process.exit(1);
    }
}

main();
