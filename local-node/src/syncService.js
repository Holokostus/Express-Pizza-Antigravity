// ============================================================
// Local Node — Cloud Sync Service
// ============================================================
// Periodically syncs queued events from SQLite to cloud API.
// Uses idempotency keys to prevent duplicates.
// Implements exponential backoff on network failures.
// ============================================================

const offlineQueue = require('./offlineQueue');

const CLOUD_API_URL = process.env.CLOUD_API_URL || 'http://localhost:3000';
const SYNC_INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS) || 10000; // 10 sec
const MAX_BACKOFF_MS = 60000; // 1 min max

let _isOnline = false;
let _syncTimer = null;
let _backoffMs = SYNC_INTERVAL_MS;
let _consecutiveFailures = 0;

// ============================================================
// Connectivity Check
// ============================================================

async function checkConnectivity() {
    try {
        const res = await fetch(`${CLOUD_API_URL}/api/health`, {
            signal: AbortSignal.timeout(3000),
        });
        const wasOffline = !_isOnline;
        _isOnline = res.ok;

        if (_isOnline && wasOffline) {
            console.log('[Sync] 🌐 Connection restored! Starting sync...');
            _backoffMs = SYNC_INTERVAL_MS;
            _consecutiveFailures = 0;
            await syncBatch(); // Immediate sync on reconnect
        }
        return _isOnline;
    } catch {
        if (_isOnline) {
            console.log('[Sync] ⚠ Connection lost — switching to offline mode');
        }
        _isOnline = false;
        return false;
    }
}

// ============================================================
// Batch Sync (SQLite → Cloud)
// ============================================================

async function syncBatch() {
    if (!_isOnline) return { synced: 0, reason: 'offline' };

    const events = offlineQueue.getUnsyncedEvents(50);
    if (events.length === 0) return { synced: 0, reason: 'empty' };

    console.log(`[Sync] Syncing ${events.length} event(s) to cloud...`);

    try {
        const res = await fetch(`${CLOUD_API_URL}/api/sync/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events }),
            signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        const result = await res.json();

        // Mark all synced events
        const eventIds = events.map(e => e.id);
        offlineQueue.markSynced(eventIds);

        _consecutiveFailures = 0;
        _backoffMs = SYNC_INTERVAL_MS;

        console.log(`[Sync] ✓ ${result.synced} synced, ${result.skipped} skipped (duplicates)`);
        return result;
    } catch (err) {
        _consecutiveFailures++;
        _backoffMs = Math.min(_backoffMs * 2, MAX_BACKOFF_MS);

        console.error(`[Sync] ✗ Sync failed (attempt ${_consecutiveFailures}): ${err.message}`);
        console.log(`[Sync] Next retry in ${_backoffMs / 1000}s`);

        if (_consecutiveFailures >= 3) {
            _isOnline = false;
        }

        return { synced: 0, error: err.message };
    }
}

// ============================================================
// Sync Loop (auto-start)
// ============================================================

function startSyncLoop() {
    if (_syncTimer) return;

    console.log(`[Sync] Starting sync loop (interval: ${SYNC_INTERVAL_MS / 1000}s)`);

    async function tick() {
        await checkConnectivity();
        if (_isOnline) {
            await syncBatch();
        }
        _syncTimer = setTimeout(tick, _backoffMs);
    }

    tick();
}

function stopSyncLoop() {
    if (_syncTimer) {
        clearTimeout(_syncTimer);
        _syncTimer = null;
        console.log('[Sync] Sync loop stopped');
    }
}

function getStatus() {
    const stats = offlineQueue.getStats();
    return {
        isOnline: _isOnline,
        consecutiveFailures: _consecutiveFailures,
        backoffMs: _backoffMs,
        queueStats: stats,
        cloudUrl: CLOUD_API_URL,
    };
}

module.exports = { checkConnectivity, syncBatch, startSyncLoop, stopSyncLoop, getStatus };
