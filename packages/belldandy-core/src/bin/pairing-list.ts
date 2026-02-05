
import { readAllowlistStore, resolveStateDir } from "../security/store.js";

async function main() {
    try {
        const stateDir = resolveStateDir();
        console.log(`State Directory: ${stateDir}`);

        const store = await readAllowlistStore(stateDir);

        if (store.allowFrom.length === 0) {
            console.log("Allowlist is empty.");
            return;
        }

        console.log(`Allowlist (${store.allowFrom.length}):`);
        for (const clientId of store.allowFrom) {
            console.log(`- ${clientId}`);
        }
    } catch (err: any) {
        console.error("Error listing allowed clients:", err.message);
        process.exit(1);
    }
}

main();
