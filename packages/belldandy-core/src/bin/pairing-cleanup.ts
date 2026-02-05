
import { cleanupPending, resolveStateDir } from "../security/store.js";

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");

    try {
        const stateDir = resolveStateDir();
        console.log(`State Directory: ${stateDir}`);

        const result = await cleanupPending({ stateDir, dryRun });

        if (result.cleaned.length === 0) {
            console.log("No expired requests found.");
        } else {
            if (dryRun) {
                console.log(`[DRY RUN] Would clean ${result.cleaned.length} expired requests:`);
            } else {
                console.log(`Cleaned ${result.cleaned.length} expired requests:`);
            }

            for (const p of result.cleaned) {
                console.log(`- [${p.code}] ${p.clientId} (created: ${p.createdAt})`);
            }
        }
        console.log(`Remaining pending requests: ${result.remaining}`);

    } catch (err: any) {
        console.error("Error cleaning up requests:", err.message);
        process.exit(1);
    }
}

main();
