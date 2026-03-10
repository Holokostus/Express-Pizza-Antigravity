// ============================================================
// Health Monitoring Service
// ============================================================
// Periodically checks all system components and reports status.
// Designed for integration with alerting (Telegram, email).
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CHECK_INTERVAL_MS = parseInt(process.env.MONITOR_INTERVAL_MS) || 60000; // 1 min

let _monitorTimer = null;

/**
 * Run comprehensive health check
 */
async function checkAll() {
    const results = {
        timestamp: new Date().toISOString(),
        status: 'ok',
        components: {},
    };

    // 1. Database
    try {
        await prisma.$queryRaw`SELECT 1`;
        results.components.database = { status: 'ok' };
    } catch (err) {
        results.components.database = { status: 'error', error: err.message };
        results.status = 'degraded';
    }

    // 2. Event Log stats
    try {
        const eventCount = await prisma.eventLog.count();
        const lastEvent = await prisma.eventLog.findFirst({ orderBy: { createdAt: 'desc' } });
        results.components.eventLog = {
            status: 'ok',
            totalEvents: eventCount,
            lastEventAt: lastEvent?.createdAt || null,
        };
    } catch (err) {
        results.components.eventLog = { status: 'error', error: err.message };
    }

    // 3. POS Sync health
    try {
        const failedSyncs = await prisma.posSync.count({ where: { syncStatus: 'FAILED' } });
        const pendingSyncs = await prisma.posSync.count({ where: { syncStatus: 'PENDING' } });
        results.components.posSync = {
            status: failedSyncs > 5 ? 'warning' : 'ok',
            failed: failedSyncs,
            pending: pendingSyncs,
        };
        if (failedSyncs > 5) results.status = 'degraded';
    } catch (err) {
        results.components.posSync = { status: 'error', error: err.message };
    }

    // 4. Order pipeline
    try {
        const activeOrders = await prisma.order.count({
            where: { status: { in: ['NEW', 'CONFIRMED', 'COOKING', 'BAKING'] } },
        });
        const staleOrders = await prisma.order.count({
            where: {
                status: 'NEW',
                createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) }, // > 30 min old
            },
        });
        results.components.orderPipeline = {
            status: staleOrders > 0 ? 'warning' : 'ok',
            active: activeOrders,
            stale: staleOrders,
        };
        if (staleOrders > 0) results.status = 'degraded';
    } catch (err) {
        results.components.orderPipeline = { status: 'error', error: err.message };
    }

    // 5. Stock (stop-list)
    try {
        const stoppedProducts = await prisma.product.count({ where: { isAvailable: false } });
        results.components.stock = {
            status: 'ok',
            stoppedProducts,
        };
    } catch (err) {
        results.components.stock = { status: 'error', error: err.message };
    }

    return results;
}

/**
 * Start periodic monitoring
 */
function startMonitoring(alertCallback = null) {
    if (_monitorTimer) return;

    console.log(`[Monitor] Starting health monitoring (interval: ${CHECK_INTERVAL_MS / 1000}s)`);

    async function tick() {
        const health = await checkAll();

        if (health.status !== 'ok') {
            console.warn('[Monitor] ⚠ System degraded:', JSON.stringify(health.components, null, 2));
            if (alertCallback) {
                alertCallback(health);
            }
        }

        _monitorTimer = setTimeout(tick, CHECK_INTERVAL_MS);
    }

    tick();
}

function stopMonitoring() {
    if (_monitorTimer) {
        clearTimeout(_monitorTimer);
        _monitorTimer = null;
    }
}

module.exports = { checkAll, startMonitoring, stopMonitoring };
