#!/usr/bin/env node
import { RelayServer } from "../relay.js";
const port = parseInt(process.env.BELLDANDY_RELAY_PORT || "28892", 10);
async function main() {
    const relay = new RelayServer(port);
    await relay.start();
    console.log(`Belldandy Relay Server running on port ${port}`);
    process.on("SIGINT", async () => {
        console.log("\nStopping relay...");
        await relay.stop();
        process.exit(0);
    });
}
main().catch((err) => {
    console.error("Relay failed to start:", err);
    process.exit(1);
});
//# sourceMappingURL=relay.js.map