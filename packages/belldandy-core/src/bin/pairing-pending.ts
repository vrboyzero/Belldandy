
import { readPairingStore, resolveStateDir } from "../security/store.js";

async function main() {
    try {
        const stateDir = resolveStateDir();
        console.log(`State Directory: ${stateDir}`);

        const store = await readPairingStore(stateDir);

        // Sort by creation time (desc)
        store.pending.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

        if (store.pending.length === 0) {
            console.log("No pending pairing requests.");
            return;
        }

        console.log(`Pending Requests (${store.pending.length}):`);
        console.log(`%-10s %-30s %s`, "CODE", "CLIENT ID", "CREATED AT");
        console.log("-".repeat(70));

        for (const p of store.pending) {
            console.log(`%-10s %-30s %s`, p.code, p.clientId, p.createdAt);
        }
    } catch (err: any) {
        console.error("Error listing pending requests:", err.message);
        process.exit(1);
    }
}

main();
