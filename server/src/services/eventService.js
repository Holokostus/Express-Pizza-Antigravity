// ============================================================
// Event Sourcing Service — Core of Local-First Architecture
// ============================================================
// Append-only event log. Every state change = an event.
// Local Node queues events offline in SQLite, syncs here.
// Idempotency key prevents duplicates during reconciliation.
// ============================================================

const { PrismaClient } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

// ============================================================
// Event Types Registry
// ============================================================
const EventTypes = {
    // Order lifecycle
    ORDER_PLACED: 'OrderPlaced',
    ORDER_CONFIRMED: 'OrderConfirmed',
    ORDER_COOKING: 'OrderCooking',
    ORDER_BAKING: 'OrderBaking',
    ORDER_READY: 'OrderReady',
    ORDER_DELIVERY: 'OrderDelivery',
    ORDER_COMPLETED: 'OrderCompleted',
    ORDER_CANCELLED: 'OrderCancelled',

    // POS sync
    POS_SYNC_STARTED: 'PosSyncStarted',
    POS_SYNC_SUCCESS: 'PosSyncSuccess',
    POS_SYNC_FAILED: 'PosSyncFailed',
    POS_VALIDATED: 'PosValidated',

    // Payment
    PAYMENT_RECEIVED: 'PaymentReceived',
    PAYMENT_FAILED: 'PaymentFailed',

    // Stock
    STOCK_OUT: 'StockOut',
    STOCK_BACK: 'StockBack',

    // Menu
    PRODUCT_UPDATED: 'ProductUpdated',
    PRODUCT_STOPPED: 'ProductStopped',
};

/**
 * Append an event to the event log.
 *
 * @param {string} eventType — from EventTypes registry
 * @param {string} aggregateType — "Order", "Product", "Stock"
 * @param {string} aggregateId — UUID or string ID of the aggregate
 * @param {object} payload — event data (prices, items, status changes, etc.)
 * @param {object} [metadata] — optional: { source, userId, restaurantId }
 * @param {string} [idempotencyKey] — auto-generated if not provided (used for offline sync)
 * @returns {Promise<EventLog>}
 */
async function appendEvent(eventType, aggregateType, aggregateId, payload, metadata = null, idempotencyKey = null) {
    const key = idempotencyKey || `${eventType}_${aggregateId}_${randomUUID()}`;

    try {
        const event = await prisma.eventLog.create({
            data: {
                eventType,
                aggregateType,
                aggregateId: String(aggregateId),
                payload,
                metadata,
                idempotencyKey: key,
                restaurantId: metadata?.restaurantId || null,
            },
        });

        console.log(`[Event] ✓ ${eventType} → ${aggregateType}:${aggregateId} (seq: ${event.sequenceNum})`);
        return event;
    } catch (err) {
        // If idempotency key already exists — skip (expected during sync)
        if (err.code === 'P2002' && err.meta?.target?.includes('idempotencyKey')) {
            console.log(`[Event] ⏭ Duplicate skipped: ${key}`);
            return null;
        }
        throw err;
    }
}

/**
 * Read events for a specific aggregate (replay)
 *
 * @param {string} aggregateType
 * @param {string} aggregateId
 * @returns {Promise<EventLog[]>}
 */
async function getEventsForAggregate(aggregateType, aggregateId) {
    return prisma.eventLog.findMany({
        where: { aggregateType, aggregateId: String(aggregateId) },
        orderBy: { sequenceNum: 'asc' },
    });
}

/**
 * Get events since a specific sequence number (for sync)
 *
 * @param {bigint|number} sinceSequence
 * @param {number} [limit=100]
 * @returns {Promise<EventLog[]>}
 */
async function getEventsSince(sinceSequence, limit = 100) {
    return prisma.eventLog.findMany({
        where: { sequenceNum: { gt: BigInt(sinceSequence) } },
        orderBy: { sequenceNum: 'asc' },
        take: limit,
    });
}

/**
 * Batch sync events from Local Node (idempotent).
 * Each event must have an idempotencyKey — duplicates are silently skipped.
 *
 * @param {Array<{eventType, aggregateType, aggregateId, payload, metadata, idempotencyKey}>} events
 * @returns {Promise<{synced: number, skipped: number}>}
 */
async function syncBatch(events) {
    let synced = 0;
    let skipped = 0;

    for (const e of events) {
        const result = await appendEvent(
            e.eventType,
            e.aggregateType,
            e.aggregateId,
            e.payload,
            e.metadata,
            e.idempotencyKey
        );

        if (result) synced++;
        else skipped++;
    }

    console.log(`[Event] Sync batch: ${synced} synced, ${skipped} skipped (duplicates)`);
    return { synced, skipped };
}

/**
 * Replay events to reconstruct aggregate state.
 * Returns the current state by applying all events in order.
 *
 * @param {string} aggregateType
 * @param {string} aggregateId
 * @param {function} reducer — (state, event) => newState
 * @param {object} [initialState={}]
 * @returns {Promise<object>}
 */
async function replay(aggregateType, aggregateId, reducer, initialState = {}) {
    const events = await getEventsForAggregate(aggregateType, aggregateId);
    return events.reduce((state, event) => reducer(state, event), initialState);
}

/**
 * Get latest sequence number (for sync protocol)
 */
async function getLatestSequence() {
    const latest = await prisma.eventLog.findFirst({
        orderBy: { sequenceNum: 'desc' },
        select: { sequenceNum: true },
    });
    return latest?.sequenceNum || BigInt(0);
}

module.exports = {
    EventTypes,
    appendEvent,
    getEventsForAggregate,
    getEventsSince,
    syncBatch,
    replay,
    getLatestSequence,
};
