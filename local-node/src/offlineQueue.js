// ============================================================
// Local Node — Offline Event Queue (SQLite)
// ============================================================
// Stores events locally when internet is down.
// Events are queued with idempotency keys and synced
// to the cloud when connectivity is restored.
// ============================================================

const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const path = require('path');

const DB_PATH = process.env.LOCAL_DB_PATH || path.join(__dirname, '..', 'data', 'local.db');

let db;

function init() {
    db = new Database(DB_PATH);

    // WAL mode for better concurrent access
    db.pragma('journal_mode = WAL');

    db.exec(`
        CREATE TABLE IF NOT EXISTS event_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            aggregate_type TEXT NOT NULL,
            aggregate_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            metadata TEXT,
            idempotency_key TEXT UNIQUE NOT NULL,
            synced INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now', 'localtime')),
            synced_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_event_queue_synced
            ON event_queue(synced);
        CREATE INDEX IF NOT EXISTS idx_event_queue_created
            ON event_queue(created_at);
    `);

    console.log(`[OfflineQueue] SQLite initialized at ${DB_PATH}`);
    return db;
}

/**
 * Enqueue an event locally (for offline operation)
 */
function enqueue(eventType, aggregateType, aggregateId, payload, metadata = null) {
    const idempotencyKey = `local_${eventType}_${aggregateId}_${randomUUID()}`;

    const stmt = db.prepare(`
        INSERT INTO event_queue (event_type, aggregate_type, aggregate_id, payload, metadata, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
        eventType,
        aggregateType,
        String(aggregateId),
        JSON.stringify(payload),
        metadata ? JSON.stringify(metadata) : null,
        idempotencyKey
    );

    console.log(`[OfflineQueue] ✓ Event queued: ${eventType} (id: ${result.lastInsertRowid})`);
    return { id: result.lastInsertRowid, idempotencyKey };
}

/**
 * Get all unsynced events (for batch sync to cloud)
 */
function getUnsyncedEvents(limit = 50) {
    const stmt = db.prepare(`
        SELECT * FROM event_queue
        WHERE synced = 0
        ORDER BY id ASC
        LIMIT ?
    `);

    return stmt.all(limit).map(row => ({
        id: row.id,
        eventType: row.event_type,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        payload: JSON.parse(row.payload),
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        idempotencyKey: row.idempotency_key,
        createdAt: row.created_at,
    }));
}

/**
 * Mark events as synced
 */
function markSynced(eventIds) {
    const placeholders = eventIds.map(() => '?').join(',');
    const stmt = db.prepare(`
        UPDATE event_queue
        SET synced = 1, synced_at = datetime('now', 'localtime')
        WHERE id IN (${placeholders})
    `);
    stmt.run(...eventIds);
    console.log(`[OfflineQueue] ✓ Marked ${eventIds.length} events as synced`);
}

/**
 * Get queue statistics
 */
function getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM event_queue').get().count;
    const pending = db.prepare('SELECT COUNT(*) as count FROM event_queue WHERE synced = 0').get().count;
    const synced = db.prepare('SELECT COUNT(*) as count FROM event_queue WHERE synced = 1').get().count;
    return { total, pending, synced };
}

/**
 * Clean up old synced events (keep last 7 days)
 */
function cleanup(daysToKeep = 7) {
    const stmt = db.prepare(`
        DELETE FROM event_queue
        WHERE synced = 1
        AND created_at < datetime('now', '-' || ? || ' days')
    `);
    const result = stmt.run(daysToKeep);
    if (result.changes > 0) {
        console.log(`[OfflineQueue] Cleaned up ${result.changes} old events`);
    }
}

module.exports = { init, enqueue, getUnsyncedEvents, markSynced, getStats, cleanup };
