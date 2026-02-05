
import { MemoryManager } from './packages/belldandy-memory/dist/manager.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const TEST_FILE = path.join(process.cwd(), 'test-watch.md');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('[Verify] Starting MemoryManager...');
    const manager = new MemoryManager({
        workspaceRoot: process.cwd(),
        // Use a temp db for testing to avoid polluting real memory
        storePath: path.join(process.cwd(), '.belldandy', 'test-memory.sqlite'),
        openaiApiKey: "dummy-key-for-test"
    });

    try {
        await manager.indexWorkspace();
        console.log('[Verify] Initial index complete. Enabled watcher.');

        // 1. Create file
        console.log('[Verify] Creating test-watch.md...');
        await fs.writeFile(TEST_FILE, 'Initial content for watcher test.');

        // Wait for watcher (debounce 1000ms + buffer)
        await sleep(2000);

        // Check memory
        let results = await manager.search('watcher test');
        if (results.length > 0 && results[0].snippet.includes('Initial content')) {
            console.log('✅ [Pass] File creation detected.');
        } else {
            console.error('❌ [Fail] File creation NOT detected.', results);
        }

        // 2. Modify file
        console.log('[Verify] Modifying test-watch.md...');
        await fs.writeFile(TEST_FILE, 'Modified content for watcher verification.');

        await sleep(2000);

        results = await manager.search('watcher verification');
        if (results.length > 0 && results[0].snippet.includes('Modified content')) {
            console.log('✅ [Pass] File modification detected.');
        } else {
            console.error('❌ [Fail] File modification NOT detected.', results);
        }

        // 3. Delete file
        console.log('[Verify] Deleting test-watch.md...');
        await fs.unlink(TEST_FILE);

        await sleep(2000);

        results = await manager.search('watcher verification');
        if (results.length === 0) {
            console.log('✅ [Pass] File deletion detected (Search returned 0 results).');
        } else {
            console.error('❌ [Fail] File deletion NOT detected (Still found results).', results);
        }

    } catch (err) {
        console.error('[Verify] Error:', err);
    } finally {
        console.log('[Verify] Closing manager...');
        manager.close();
        // Cleanup temp file just in case
        try { await fs.unlink(TEST_FILE); } catch { }
    }
}

run();
