// ============================================================
// Stock Broadcast Service
// ============================================================
// Manages real-time product availability (stop-list).
// Broadcasts "out of stock" signals to all channels:
// - Website (via API/WebSocket)
// - Aggregators (Delivio, Wolt via their APIs)
// - iiko/r_keeper (reverse sync)
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { appendEvent, EventTypes } = require('./eventService');

/**
 * Mark product as out of stock at a restaurant
 */
async function setOutOfStock(productId, restaurantId, reason = '') {
    // Update product availability
    await prisma.product.update({
        where: { id: productId },
        data: { isAvailable: false },
    });

    // Log stock event
    await prisma.stockEvent.create({
        data: {
            productId,
            restaurantId,
            type: 'OUT_OF_STOCK',
            reason,
        },
    });

    // Append to event log
    await appendEvent(EventTypes.STOCK_OUT, 'Product', String(productId), {
        productId, restaurantId, reason,
    }, { restaurantId });

    // Broadcast to aggregators
    await broadcastToAggregators(productId, false, reason);

    console.log(`[Stock] ✗ Product #${productId} → OUT OF STOCK (${reason})`);
}

/**
 * Mark product as back in stock at a restaurant
 */
async function setBackInStock(productId, restaurantId) {
    await prisma.product.update({
        where: { id: productId },
        data: { isAvailable: true },
    });

    await prisma.stockEvent.create({
        data: {
            productId,
            restaurantId,
            type: 'BACK_IN_STOCK',
        },
    });

    await appendEvent(EventTypes.STOCK_BACK, 'Product', String(productId), {
        productId, restaurantId,
    }, { restaurantId });

    await broadcastToAggregators(productId, true);

    console.log(`[Stock] ✓ Product #${productId} → BACK IN STOCK`);
}

/**
 * Broadcast stock change to all active aggregator channels
 */
async function broadcastToAggregators(productId, isAvailable, reason = '') {
    const channels = await prisma.aggregatorChannel.findMany({
        where: { isActive: true },
    });

    const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { name: true, posExternalId: true },
    });

    for (const channel of channels) {
        try {
            await _sendStockUpdate(channel, {
                productId,
                productName: product?.name,
                posExternalId: product?.posExternalId,
                isAvailable,
                reason,
            });
        } catch (err) {
            console.error(`[Stock] Broadcast to ${channel.name} failed:`, err.message);
        }
    }
}

/**
 * Send stock update to specific aggregator
 */
async function _sendStockUpdate(channel, data) {
    if (!channel.apiKey) {
        console.log(`[Stock] ${channel.name}: no API key configured, skipping`);
        return;
    }

    const config = channel.config || {};
    const endpoint = config.stockUpdateUrl;

    if (!endpoint) {
        console.log(`[Stock] ${channel.name}: no stockUpdateUrl configured, skipping`);
        return;
    }

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channel.apiKey}`,
        },
        body: JSON.stringify({
            productId: data.posExternalId || String(data.productId),
            available: data.isAvailable,
            reason: data.reason,
        }),
    });

    if (!res.ok) {
        throw new Error(`${channel.name} API returned ${res.status}`);
    }

    console.log(`[Stock] ✓ Broadcast to ${channel.name}: product ${data.productName} → ${data.isAvailable ? 'available' : 'unavailable'}`);
}

/**
 * Get current stop-list for a restaurant
 */
async function getStopList(restaurantId) {
    const events = await prisma.stockEvent.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
        distinct: ['productId'],
        include: {
            product: { select: { id: true, name: true, image: true } },
        },
    });

    return events
        .filter(e => e.type === 'OUT_OF_STOCK')
        .map(e => ({
            productId: e.productId,
            name: e.product.name,
            reason: e.reason,
            stoppedAt: e.createdAt,
        }));
}

module.exports = { setOutOfStock, setBackInStock, getStopList, broadcastToAggregators };
