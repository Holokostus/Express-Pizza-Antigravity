// ============================================================
// Aggregator Webhook Routes — Delivio / Wolt
// ============================================================
// Receives webhook payloads from food aggregators,
// normalizes them into our Order format, and auto-forwards
// to the POS system. "Tablet-less" flow.
// ============================================================

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { calculateCart } = require('../services/cartService');
const { pushToPos } = require('../services/posSyncService');
const { notifyNewOrder } = require('../services/telegramService');
const { appendEvent, EventTypes } = require('../services/eventService');

// ============================================================
// Webhook Signature Verification
// ============================================================

function verifySignature(rawBody, signature, secret) {
    const normalizedSecret = typeof secret === 'string' ? secret.trim() : '';

    if (!normalizedSecret || normalizedSecret.startsWith('change-me')) {
        return { isValid: false, isMisconfigured: true };
    }

    const expected = crypto.createHmac('sha256', normalizedSecret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(String(signature || ''), 'utf8');

    if (expectedBuffer.length !== signatureBuffer.length) {
        return { isValid: false, isMisconfigured: false };
    }

    return {
        isValid: crypto.timingSafeEqual(expectedBuffer, signatureBuffer),
        isMisconfigured: false,
    };
}

// ============================================================
// POST /api/aggregators/delivio/webhook
// ============================================================

router.post('/delivio/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    try {
        const channel = await prisma.aggregatorChannel.findUnique({ where: { name: 'delivio' } });
        if (!channel || !channel.isActive) {
            return res.status(404).json({ error: 'Channel inactive' });
        }

        const rawBody = typeof req.body === 'string' ? req.body : req.body.toString();
        const sig = req.headers['x-delivio-signature'] || '';

        const verification = verifySignature(rawBody, sig, channel.webhookSecret);
        if (verification.isMisconfigured) {
            console.error('[Delivio] Misconfiguration: aggregator_channels.webhookSecret is empty or default. Rejecting webhook.');
            return res.status(500).json({ error: 'Webhook channel misconfiguration' });
        }

        if (!verification.isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const payload = JSON.parse(rawBody);
        const normalized = normalizeDelivioOrder(payload);

        const order = await createOrderFromAggregator(normalized, 'DELIVIO');

        res.json({ status: 'accepted', orderId: order.id });
    } catch (err) {
        console.error('[Delivio] Webhook error:', err);
        res.status(200).json({ status: 'error', message: err.message });
    }
});

// ============================================================
// POST /api/aggregators/wolt/webhook
// ============================================================

router.post('/wolt/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    try {
        const channel = await prisma.aggregatorChannel.findUnique({ where: { name: 'wolt' } });
        if (!channel || !channel.isActive) {
            return res.status(404).json({ error: 'Channel inactive' });
        }

        const rawBody = typeof req.body === 'string' ? req.body : req.body.toString();
        const sig = req.headers['x-wolt-signature'] || '';

        const verification = verifySignature(rawBody, sig, channel.webhookSecret);
        if (verification.isMisconfigured) {
            console.error('[Wolt] Misconfiguration: aggregator_channels.webhookSecret is empty or default. Rejecting webhook.');
            return res.status(500).json({ error: 'Webhook channel misconfiguration' });
        }

        if (!verification.isValid) {
            return res.status(403).json({ error: 'Invalid signature' });
        }

        const payload = JSON.parse(rawBody);
        const normalized = normalizeWoltOrder(payload);

        const order = await createOrderFromAggregator(normalized, 'WOLT');

        res.json({ status: 'accepted', orderId: order.id });
    } catch (err) {
        console.error('[Wolt] Webhook error:', err);
        res.status(200).json({ status: 'error', message: err.message });
    }
});

// ============================================================
// Normalize Delivio payload → internal format
// ============================================================

function normalizeDelivioOrder(payload) {
    const order = payload.order || payload;
    return {
        externalId: `delivio_${order.id || order.orderId || Date.now()}`,
        customerName: order.customer?.name || order.customerName || 'Delivio Guest',
        customerPhone: order.customer?.phone || order.customerPhone || '',
        customerAddress: order.delivery?.address || order.address || '',
        payment: 'BEPAID_ONLINE', // Aggregator handles payment
        items: (order.items || []).map(item => ({
            posExternalId: item.productId || item.externalId,
            name: item.name,
            quantity: item.quantity || 1,
            unitPrice: item.price || 0,
            modifiers: (item.modifiers || []).map(m => ({
                posExternalId: m.id || m.externalId,
                name: m.name,
                price: m.price || 0,
            })),
        })),
        total: order.total || order.totalPrice || 0,
        note: order.comment || order.note || '',
    };
}

// ============================================================
// Normalize Wolt payload → internal format
// ============================================================

function normalizeWoltOrder(payload) {
    const order = payload.order || payload;
    return {
        externalId: `wolt_${order.id || order.order_id || Date.now()}`,
        customerName: order.consumer?.name || 'Wolt Guest',
        customerPhone: order.consumer?.phone || '',
        customerAddress: order.delivery?.location?.formatted_address || '',
        payment: 'BEPAID_ONLINE',
        items: (order.items || []).map(item => ({
            posExternalId: item.external_id || item.pos_id,
            name: item.name,
            quantity: item.count || 1,
            unitPrice: (item.unit_price || 0) / 100, // Wolt sends in cents
            modifiers: (item.options || []).map(opt => ({
                posExternalId: opt.external_id || opt.pos_id,
                name: opt.name,
                price: (opt.unit_price || 0) / 100,
            })),
        })),
        total: (order.total_price || 0) / 100,
        note: order.consumer_comment || '',
    };
}

// ============================================================
// Create order in DB from normalized aggregator data
// ============================================================

async function createOrderFromAggregator(normalized, source) {
    // Find restaurant (use first active for now)
    const restaurant = await prisma.restaurant.findFirst({ where: { isActive: true } });

    // Extract all unique posExternalIds
    const posExternalIds = normalized.items
        .map(i => i.posExternalId)
        .filter(id => id !== null && id !== undefined);

    // Batch fetch all matching products
    const products = await prisma.product.findMany({
        where: { posExternalId: { in: posExternalIds } },
        include: { sizes: { orderBy: { price: 'asc' } } }
    });

    const productMap = new Map(products.map(p => [p.posExternalId, p]));

    const items = [];
    for (const item of normalized.items) {
        const product = item.posExternalId ? productMap.get(item.posExternalId) : null;
        let productSize = null;

        if (product && product.sizes.length > 0) {
            productSize = product.sizes[0]; // Default to cheapest size
        }

        items.push({
            productId: product?.id || null,
            productSizeId: productSize?.id || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            name: item.name,
            note: '',
        });
    }

    // Create order
    const order = await prisma.order.create({
        data: {
            externalOrderId: normalized.externalId,
            source,
            customerName: normalized.customerName,
            customerPhone: normalized.customerPhone,
            customerAddress: normalized.customerAddress,
            payment: normalized.payment,
            status: 'NEW',
            subtotal: normalized.total,
            discount: 0,
            total: normalized.total,
            restaurantId: restaurant?.id || null,
            items: {
                create: items
                    .filter(i => i.productId && i.productSizeId)
                    .map(i => ({
                        productId: i.productId,
                        productSizeId: i.productSizeId,
                        quantity: i.quantity,
                        unitPrice: i.unitPrice,
                    })),
            },
        },
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
    });

    console.log(`[Aggregator] ✓ ${source} order → #${order.id} (ext: ${normalized.externalId})`);

    // Event log
    await appendEvent(EventTypes.ORDER_PLACED, 'Order', order.externalOrderId, {
        orderId: order.id, source, total: normalized.total,
    }, { source }).catch(() => { });

    // Auto-forward to POS (non-blocking)
    pushToPos(order).catch(err => console.error(`[PosSync] Auto-forward failed:`, err));

    // Notify manager (non-blocking)
    notifyNewOrder(order).catch(err => console.error(`[Telegram] Notify error:`, err));

    return order;
}

module.exports = router;
