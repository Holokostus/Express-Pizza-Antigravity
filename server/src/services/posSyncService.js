// ============================================================
// POS Sync Orchestrator Service
// ============================================================
// Routes orders to the correct POS system based on restaurant
// config. Handles retries for failed syncs.
// ============================================================

const prisma = require('../lib/prisma');
const iikoService = require('./iikoService');
const rkeeperService = require('./rkeeperService');
const { appendEvent, EventTypes } = require('./eventService');

/**
 * Push an order to the correct POS system based on restaurant config.
 * For r_keeper: runs ValidateOrder first, then CreateOrder.
 * For iiko: pushes directly (validation at POS is post-facto).
 */
async function pushToPos(order) {
    // Determine POS type from restaurant
    let posType = 'NONE';

    if (order.restaurantId) {
        const restaurant = await prisma.restaurant.findUnique({
            where: { id: order.restaurantId },
        });
        posType = restaurant?.posType || 'NONE';
    }

    if (posType === 'NONE') {
        console.log(`[PosSync] No POS configured for order #${order.id}`);
        return { success: true, posType: 'NONE', skipped: true };
    }

    if (posType === 'IIKO') {
        return iikoService.pushOrder(order);
    }

    if (posType === 'RKEEPER') {
        // r_keeper requires ValidateOrder BEFORE payment
        const validation = await rkeeperService.validateOrder(order);

        if (!validation.valid) {
            console.error(`[PosSync] r_keeper validation failed for order #${order.id}`);
            return {
                success: false,
                posType: 'RKEEPER',
                validationFailed: true,
                unavailableItems: validation.unavailableItems || [],
            };
        }

        // Validation passed → push order
        return rkeeperService.createOrder(order);
    }

    return { success: false, error: `Unknown POS type: ${posType}` };
}

/**
 * Retry failed POS syncs (called by cron or manual trigger)
 */
async function retryFailedSyncs(maxRetries = 5) {
    const failedSyncs = await prisma.posSync.findMany({
        where: {
            syncStatus: { in: ['FAILED', 'RETRY'] },
            attempts: { lt: maxRetries },
        },
        include: {
            order: {
                include: {
                    items: {
                        include: {
                            product: true,
                            productSize: true,
                            modifiers: { include: { modifier: true } },
                        },
                    },
                    restaurant: true,
                },
            },
        },
        take: 10, // Process 10 at a time
    });

    if (failedSyncs.length === 0) return { retried: 0 };

    console.log(`[PosSync] Retrying ${failedSyncs.length} failed sync(s)...`);
    let retried = 0;

    for (const sync of failedSyncs) {
        // Mark as RETRY
        await prisma.posSync.update({
            where: { id: sync.id },
            data: { syncStatus: 'RETRY' },
        });

        const result = await pushToPos(sync.order);
        if (result.success) retried++;
    }

    console.log(`[PosSync] Retry complete: ${retried}/${failedSyncs.length} succeeded`);
    return { retried, total: failedSyncs.length };
}

module.exports = { pushToPos, retryFailedSyncs };
