import { approvePairingCode } from "../security/store.js";
const code = process.argv[2]?.trim();
if (!code) {
    console.error("Usage: pairing-approve <CODE>");
    process.exit(2);
}
const result = await approvePairingCode({ code, env: process.env });
if (!result.ok) {
    console.error(result.message);
    process.exit(1);
}
console.log(`Approved client: ${result.clientId}`);
//# sourceMappingURL=pairing-approve.js.map