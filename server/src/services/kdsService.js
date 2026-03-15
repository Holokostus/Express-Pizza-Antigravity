// ============================================================
// Express Pizza — KDS Service (WebSocket) (Sprint 4)
// ============================================================

const WebSocket = require('ws');
const prisma = require('../lib/prisma');
const loyaltyService = require('./loyaltyService');
const { normalizeOrderStatus, assertKnownOrderStatus, assertAllowedStatusTransition } = require('./orderStatusPolicy');

let wss = null;

// Track connections per restaurant
// Map<restaurantId, Set<WebSocket>>
const clients = new Map();
// Pending ACK retries for NEW_ORDER delivery
// Map<"restaurantId:orderId", { timeout: NodeJS.Timeout, attempts: number, payload: string }>
const pendingAcks = new Map();

const ACK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 5;

function getAckKey(restaurantId, orderId) {
    return `${parseInt(restaurantId)}:${parseInt(orderId)}`;
}

function clearAckTimer(ackKey) {
    const pending = pendingAcks.get(ackKey);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingAcks.delete(ackKey);
}

function sendToRestaurant(restaurantId, payload) {
    const restaurantClients = clients.get(parseInt(restaurantId));
    if (!restaurantClients || restaurantClients.size === 0) return false;

    let sent = false;
    for (const client of restaurantClients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
            sent = true;
        }
    }
    return sent;
}

function scheduleAckRetry(restaurantId, orderData) {
    const orderId = orderData?.id;
    if (!orderId) return;

    const ackKey = getAckKey(restaurantId, orderId);
    clearAckTimer(ackKey);

    const payload = JSON.stringify({
        type: 'NEW_ORDER',
        data: orderData
    });

    const pending = {
        attempts: 0,
        payload,
        timeout: null
    };

    const queueRetry = () => {
        pending.timeout = setTimeout(() => {
            // If already acknowledged, skip
            if (!pendingAcks.has(ackKey)) {
                return;
            }

            pending.attempts += 1;

            if (pending.attempts > MAX_RETRIES) {
                clearAckTimer(ackKey);
                console.warn('KDS client offline, dropping ACK retry');
                return;
            }

            console.log(`[KDS] ACK timeout for order #${orderId} (attempt ${pending.attempts}). Retrying delivery...`);
            const wasSent = sendToRestaurant(restaurantId, pending.payload);

            if (!wasSent) {
                console.log(`[KDS] Retry for order #${orderId} skipped: no active clients for restaurant ${restaurantId}`);
            }

            queueRetry();
        }, ACK_TIMEOUT_MS);
    };

    pendingAcks.set(ackKey, pending);

    const wasSent = sendToRestaurant(restaurantId, payload);
    if (!wasSent) {
        console.log(`[KDS] Initial delivery for order #${orderId} pending: no active clients for restaurant ${restaurantId}`);
    }

    queueRetry();
}

function broadcastStatusSync(restaurantId, payloadData) {
    const payload = JSON.stringify({
        type: 'STATUS_SYNC',
        data: payloadData
    });
    sendToRestaurant(restaurantId, payload);
}

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

                if (message.type === 'KDS_ACK' && message.orderId) {
                    const ackKey = getAckKey(restaurantId, message.orderId);
                    if (pendingAcks.has(ackKey)) {
                        clearAckTimer(ackKey);
                        console.log(`[KDS] ACK received for order #${message.orderId} (restaurant ${restaurantId})`);
                    }
                    return;
                }

                // Allow KDS clients to update status
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
    scheduleAckRetry(restaurantId, orderData);
}

/**
 * Chef updates order status from the KDS tablet
 */
async function updateOrderStatus(orderId, newStatus) {
    try {
        const normalizedStatus = normalizeOrderStatus(newStatus);
        assertKnownOrderStatus(normalizedStatus);

        const existingOrder = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                orderNumber: true,
                externalOrderId: true,
                status: true,
                userId: true,
                total: true,
                restaurantId: true
            }
        });

        if (!existingOrder) {
            throw new Error(`Order ${orderId} not found`);
        }

        assertAllowedStatusTransition(existingOrder.status, normalizedStatus);

        const order = await prisma.order.update({
            where: { id: orderId },
            data: {
                status: normalizedStatus,
                completedAt: normalizedStatus === 'COMPLETED' ? new Date() : null
            }
        });

        console.log(`[KDS] Order #${order.orderNumber} status updated to ${normalizedStatus}`);

        // Log to Event Sourcing table
        await prisma.eventLog.create({
            data: {
                eventType: 'ORDER_STATUS_CHANGED',
                aggregateType: 'Order',
                aggregateId: order.externalOrderId,
                idempotencyKey: `status_${order.externalOrderId}_${normalizedStatus}_${Date.now()}`,
                restaurantId: order.restaurantId,
                payload: { oldStatus: existingOrder.status, newStatus: normalizedStatus }
            }
        });

        let loyaltyPoints = null;

        if (normalizedStatus === 'COMPLETED' && existingOrder.status !== 'COMPLETED' && existingOrder.userId) {
            const baseAmount = Math.max(0, Number(existingOrder.total ?? 0));
            const cashbackAmount = Math.floor(baseAmount * 0.05);

            if (cashbackAmount > 0) {
                await loyaltyService.awardPoints(
                    existingOrder.userId,
                    cashbackAmount,
                    order.id,
                    `earn_completed_${order.id}`
                );

                const balance = await prisma.pointsBalance.findUnique({
                    where: { userId: existingOrder.userId },
                    select: { currentBalance: true }
                });
                loyaltyPoints = balance?.currentBalance ?? null;
            }
        }

        // Broadcast status sync to KDS + customer tracker listeners
        broadcastStatusSync(order.restaurantId, {
            orderId: order.id,
            externalOrderId: order.externalOrderId,
            status: normalizedStatus,
            userId: existingOrder.userId,
            loyaltyPoints
        });

    } catch (err) {
        console.error('[KDS] Failed to update order status:', err);
        throw err;
    }
}

/**
 * Get active orders for KDS
 */
async function getActiveOrders(restaurantId) {
    return await prisma.order.findMany({
        where: {
            restaurantId: parseInt(restaurantId),
            status: { in: ['NEW', 'CONFIRMED', 'COOKING', 'BAKING'] }
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
