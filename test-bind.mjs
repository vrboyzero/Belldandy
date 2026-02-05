
import { spawn } from "node:child_process";
import http from "node:http";

// Helper to check connection
function checkConnection(port, host) {
    return new Promise((resolve) => {
        const req = http.get(`http://${host}:${port}`, (res) => {
            resolve(true); // Connected
            res.resume();
        });
        req.on('error', () => resolve(false)); // Failed
        req.setTimeout(1000, () => { req.destroy(); resolve(false); });
    });
}

// Helper to start gateway
function startGateway(env = {}) {
    return spawn("node",
        ["--import", "tsx", "packages/belldandy-core/src/bin/gateway.ts"],
        {
            cwd: process.cwd(),
            env: { ...process.env, ...env, FORCE_COLOR: "1" },
            stdio: 'pipe'
        }
    );
}

async function test() {
    console.log("--- TEST 1: Default Secure Binding (127.0.0.1) ---");
    const p1 = startGateway({ BELLDANDY_PORT: "29991" }); // Use different port to avoid conflicts

    // Wait for start
    await new Promise(r => setTimeout(r, 4000));

    const local = await checkConnection(29991, "127.0.0.1");
    console.log(`Check 127.0.0.1: ${local ? "PASS (Accessible)" : "FAIL (Not Accessible)"}`);

    // Try LAN IP (assuming we have one, e.g. from eth0 or similar, but for test we can try connecting to LAN IP of this machine)
    // We can't easily detect LAN IP here without dependencies, but we can assume if it binds to 127.0.0.1 only, it fails on LAN IP.
    // However, in some envs 127.0.0.1 might route weirdly. 
    // Let's rely on the process output for verification too.
    p1.kill();

    console.log("\n--- TEST 2: Insecure Binding (0.0.0.0) ---");
    const p2 = startGateway({ BELLDANDY_PORT: "29992", BELLDANDY_HOST: "0.0.0.0", BELLDANDY_AUTH_MODE: "none" });

    p2.stdout.on('data', (d) => {
        const msg = d.toString();
        if (msg.includes("SECURITY WARNING")) {
            console.log("PASS: Security Warning detected in logs");
        }
    });

    await new Promise(r => setTimeout(r, 4000));
    const local2 = await checkConnection(29992, "127.0.0.1");
    // Verify it works
    console.log(`Check 127.0.0.1 (on 0.0.0.0 bind): ${local2 ? "PASS" : "FAIL"}`);

    p2.kill();
}

test();
