// ============================================================
// Express Pizza — KDS Service (WebSocket) (Sprint 4)
// ============================================================

const WebSocket = require('ws');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

let wss = null;

// Track connections per restaurant
// Map<restaurantId, Set<WebSocket>>
const clients = new Map();

function initKDSWebSocket(server) {
    wss = new WebSocket.Server({ server, path: '/ws/kds' });

    console.log('[KDS] WebSocket server initialized on /ws/kds');

    wss.on('connection', (ws, req) => {
        // Simple auth/routing based on query param: /ws/kds?restaurantId=1
        const url = new URL(req.url, `http://${req.headers.host}`);
        const restaurantId = parseInt(url.searchParams.get('restaurantId')) || 1;

        if (!clients.has(restaurantId)) {
            clients.set(restaurantId, new Set());
        }
        clients.get(restaurantId).add(ws);

        ws.restaurantId = restaurantId;
        console.log(`[KDS] Client connected for restaurant ${restaurantId}`);

        // Send connection ACK
        ws.send(JSON.stringify({ type: 'CONNECTED', data: { restaurantId } }));

        ws.on('message', async (messageAsString) => {
            try {
                const message = JSON.parse(messageAsString);

                // Allow KDS clients to update status (PREPARING -> READY)
                if (message.type === 'STATUS_UPDATE') {
                    const { orderId, status } = message.data;
                    await updateOrderStatus(orderId, status);
                }
            } catch (err) {
                console.error('[KDS] Error parsing message:', err);
            }
        });

        ws.on('close', () => {
            clients.get(restaurantId).delete(ws);
            console.log(`[KDS] Client disconnected from restaurant ${restaurantId}`);
        });
    });
}

/**
 * Broadcasts an order to all KDS screens at a specific restaurant
 */
function broadcastOrderToKDS(restaurantId, orderData) {
    if (!wss) return;

    const restaurantClients = clients.get(parseInt(restaurantId));
    if (!restaurantClients || restaurantClients.size === 0) return;

    const payload = JSON.stringify({
        type: 'NEW_ORDER',
        data: orderData
    });

    for (const client of restaurantClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
}

/**
 * Chef updates order status from the KDS tablet
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        const order = await prisma.order.update({
            where: { id: orderId },
            data: { status: newStatus }
        });

        console.log(`[KDS] Order #${order.orderNumber} status updated to ${newStatus}`);

        // Log to Event Sourcing table
        await prisma.eventLog.create({
            data: {
                eventType: 'ORDER_STATUS_CHANGED',
                aggregateType: 'Order',
                aggregateId: order.externalOrderId,
                idempotencyKey: `status_${order.externalOrderId}_${newStatus}_${Date.now()}`,
                restaurantId: order.restaurantId,
                payload: { oldStatus: order.status, newStatus }
            }
        });

        // Broadcast the status change back to all KDS screens to keep them synced
        const restaurantClients = clients.get(order.restaurantId);
        if (restaurantClients) {
            const payload = JSON.stringify({
                type: 'STATUS_SYNC',
                data: { orderId: order.id, status: newStatus }
            });
            for (const client of restaurantClients) {
                if (client.readyState === WebSocket.OPEN) client.send(payload);
            }
        }

    } catch (err) {
        console.error('[KDS] Failed to update order status:', err);
    }
}

/**
 * Get active orders for KDS
 */
async function getActiveOrders(restaurantId) {
    return await prisma.order.findMany({
        where: {
            restaurantId: parseInt(restaurantId),
            status: { in: ['NEW', 'COOKING', 'BAKING'] }
        },
        orderBy: { createdAt: 'asc' },
        include: {
            items: {
                include: {
                    product: true,
                    modifiers: { include: { modifier: true } }
                }
            }
        }
    });
}

module.exports = {
    initKDSWebSocket,
    broadcastOrderToKDS,
    updateOrderStatus,
    getActiveOrders
};
