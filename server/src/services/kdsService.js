// ============================================================
// Express Pizza — KDS Service (WebSocket) (Sprint 4)
// ============================================================

const WebSocket = require('ws');
const prisma = require('../lib/prisma');
const loyaltyService = require('./loyaltyService');
const { verifyToken } = require('../utils/jwt');

let wss = null;

// Track connections per restaurant
// Map<restaurantId, Set<WebSocket>>
const clients = new Map();
// Pending ACK retries for NEW_ORDER delivery
// Map<"restaurantId:orderId", { timeout: NodeJS.Timeout, attempts: number, payload: string }>
const pendingAcks = new Map();

const ACK_TIMEOUT_MS = 5000;
const MAX_RETRIES = 5;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_MAX_MESSAGES = 30;

function extractBearerToken(req, url) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const queryToken = url.searchParams.get('token');

    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice('Bearer '.length).trim();
    }

    if (queryToken) {
        return queryToken.trim();
    }

    return null;
}

function hasRestaurantAccess(decodedToken, restaurantId) {
    if (!decodedToken) return false;
    if (decodedToken.role === 'ADMIN') return true;

    const explicitRestaurantId = Number(decodedToken.restaurantId);
    if (Number.isInteger(explicitRestaurantId)) {
        return explicitRestaurantId === restaurantId;
    }

    if (Array.isArray(decodedToken.restaurantIds)) {
        const allowedRestaurants = decodedToken.restaurantIds
            .map((id) => Number(id))
            .filter(Number.isInteger);

        return allowedRestaurants.includes(restaurantId);
    }

    // Backward compatibility: older tokens may not contain restaurant scope.
    return true;
}

function isRateLimited(ws) {
    const now = Date.now();

    if (!ws.rateLimitState || (now - ws.rateLimitState.windowStart) > RATE_LIMIT_WINDOW_MS) {
        ws.rateLimitState = {
            windowStart: now,
            count: 0
        };
    }

    ws.rateLimitState.count += 1;
    return ws.rateLimitState.count > RATE_LIMIT_MAX_MESSAGES;
}

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
    wss = new WebSocket.Server({
        server,
        path: '/ws/kds',
        verifyClient: (info, done) => {
            try {
                const url = new URL(info.req.url, `http://${info.req.headers.host}`);
                const restaurantId = Number.parseInt(url.searchParams.get('restaurantId'), 10);

                if (!Number.isInteger(restaurantId) || restaurantId <= 0) {
                    return done(false, 400, 'Invalid restaurantId');
                }

                const token = extractBearerToken(info.req, url);
                if (!token) {
                    return done(false, 401, 'Missing auth token');
                }

                const decoded = verifyToken(token);
                if (!hasRestaurantAccess(decoded, restaurantId)) {
                    return done(false, 403, 'Restaurant access denied');
                }

                info.req.auth = decoded;
                info.req.restaurantId = restaurantId;
                return done(true);
            } catch (err) {
                console.warn('[KDS] WebSocket handshake rejected:', err.message);
                return done(false, 401, 'Invalid auth token');
            }
        }
    });

    console.log('[KDS] WebSocket server initialized on /ws/kds');

    wss.on('connection', (ws, req) => {
        const restaurantId = req.restaurantId;
        const user = req.auth;

        if (!clients.has(restaurantId)) {
            clients.set(restaurantId, new Set());
        }
        clients.get(restaurantId).add(ws);

        ws.restaurantId = restaurantId;
        ws.user = user;
        console.log(`[KDS] Client connected for restaurant ${restaurantId} (role: ${user?.role || 'unknown'})`);

        // Send connection ACK
        ws.send(JSON.stringify({ type: 'CONNECTED', data: { restaurantId } }));

        ws.on('message', async (messageAsString) => {
            if (isRateLimited(ws)) {
                console.warn(`[KDS] Rate limit exceeded for user ${ws.user?.userId || 'unknown'} at restaurant ${restaurantId}`);
                ws.close(1008, 'Rate limit exceeded');
                return;
            }

            try {
                if (typeof messageAsString !== 'string' && !Buffer.isBuffer(messageAsString)) {
                    console.warn('[KDS] Unsupported message type received');
                    return;
                }

                const rawMessage = Buffer.isBuffer(messageAsString) ? messageAsString.toString('utf-8') : messageAsString;
                const message = JSON.parse(rawMessage);
                if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
                    console.warn('[KDS] Invalid message payload structure');
                    return;
                }

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
                    if (!['COOK', 'ADMIN'].includes(ws.user?.role)) {
                        console.warn(`[KDS] Unauthorized STATUS_UPDATE attempt by role ${ws.user?.role || 'unknown'} at restaurant ${restaurantId}`);
                        ws.close(1008, 'Forbidden operation');
                        return;
                    }

                    if (!message.data || typeof message.data !== 'object') {
                        console.warn('[KDS] STATUS_UPDATE rejected: missing data object');
                        return;
                    }

                    const { orderId, status } = message.data;
                    if (!Number.isInteger(Number(orderId)) || typeof status !== 'string' || status.length === 0) {
                        console.warn('[KDS] STATUS_UPDATE rejected: invalid payload');
                        return;
                    }

                    await updateOrderStatus(Number(orderId), status, {
                        actorUserId: ws.user?.userId,
                        restaurantId: ws.restaurantId
                    });
                }
            } catch (err) {
                if (err instanceof SyntaxError) {
                    console.warn('[KDS] Invalid JSON received from client');
                    return;
                }

                console.error('[KDS] Error handling message:', err);
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
async function updateOrderStatus(orderId, newStatus, context = {}) {
    try {
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

        if (context.restaurantId && existingOrder.restaurantId !== context.restaurantId) {
            throw new Error(`Restaurant scope mismatch for order ${orderId}`);
        }

        const order = await prisma.order.update({
            where: { id: orderId },
            data: {
                status: newStatus,
                completedAt: newStatus === 'COMPLETED' ? new Date() : null
            }
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
                payload: { oldStatus: existingOrder.status, newStatus }
            }
        });

        let loyaltyPoints = null;

        if (newStatus === 'COMPLETED' && existingOrder.status !== 'COMPLETED' && existingOrder.userId) {
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
            status: newStatus,
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
