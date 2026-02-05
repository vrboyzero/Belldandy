import { revokeClient } from "../security/store.js";
const clientId = process.argv[2]?.trim();
if (!clientId) {
    console.error("Usage: pairing-revoke <CLIENT_ID>");
    process.exit(2);
}
const result = await revokeClient({ clientId, env: process.env });
if (!result.ok) {
    process.exit(1);
}
console.log(result.removed ? `Revoked: ${clientId}` : `Not found: ${clientId}`);
//# sourceMappingURL=pairing-revoke.js.map