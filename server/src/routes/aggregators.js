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

function normalizeSignature(signature) {
    if (typeof signature !== 'string') return '';

    const normalized = signature.trim().toLowerCase();
    return normalized.startsWith('sha256=') ? normalized.slice(7) : normalized;
}

function verifySignature(rawBody, signature, secret) {
    if (!secret || secret.startsWith('change-me')) {
        return { ok: false, configError: true, reason: 'missing_or_placeholder_secret' };
    }

    const normalizedSignature = normalizeSignature(signature);
    if (!/^[0-9a-f]+$/.test(normalizedSignature) || normalizedSignature.length % 2 !== 0) {
        return { ok: false, configError: false, reason: 'invalid_signature_format' };
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(normalizedSignature, 'hex');

    if (expectedBuffer.length !== providedBuffer.length) {
        return { ok: false, configError: false, reason: 'signature_length_mismatch' };
    }

    return {
        ok: crypto.timingSafeEqual(expectedBuffer, providedBuffer),
        configError: false,
        reason: 'signature_mismatch',
    };
}

async function logInvalidSignature(channel, reason, req) {
    console.error(`[${channel}] Invalid signature (${reason})`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
    });

    await appendEvent(EventTypes.AGGREGATOR_INVALID_SIGNATURE, 'AggregatorWebhook', channel, {
        reason,
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'unknown',
    }, { source: channel }).catch(() => { });
}

// ============================================================
// POST /api/aggregators/delivio/webhook
// ============================================================

router.post('/delivio/webhook', async (req, res) => {
    try {
        const channel = await prisma.aggregatorChannel.findUnique({ where: { name: 'delivio' } });
        if (!channel || !channel.isActive) {
            return res.status(404).json({ error: 'Channel inactive' });
        }

        const rawBody = req.rawBody;
        if (!Buffer.isBuffer(rawBody)) {
            return res.status(400).json({ error: 'Invalid JSON payload' });
        }

        const sig = req.headers['x-delivio-signature'] || '';

        const signatureCheck = verifySignature(rawBody, sig, channel.webhookSecret);
        if (signatureCheck.configError) {
            console.error('[Delivio] Webhook secret is not configured correctly.');
            return res.status(503).json({ error: 'Webhook misconfigured: missing or placeholder secret' });
        }

        if (!signatureCheck.ok) {
            await logInvalidSignature('delivio', signatureCheck.reason, req);
            return res.status(403).json({ error: 'Invalid signature' });
        }

        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
            return res.status(400).json({ error: 'Invalid JSON payload' });
        }

        const normalized = normalizeDelivioOrder(payload);

        const result = await createOrderFromAggregator(normalized, 'DELIVIO');
        if (!result.created) {
            return res.status(200).json({ status: 'skipped', reason: result.reason, externalId: normalized.externalId });
        }

        res.json({ status: 'accepted', orderId: result.order.id });
    } catch (err) {
        console.error('[Delivio] Webhook error:', err);
        res.status(200).json({ status: 'error', message: err.message });
    }
});

// ============================================================
// POST /api/aggregators/wolt/webhook
// ============================================================

router.post('/wolt/webhook', async (req, res) => {
    try {
        const channel = await prisma.aggregatorChannel.findUnique({ where: { name: 'wolt' } });
        if (!channel || !channel.isActive) {
            return res.status(404).json({ error: 'Channel inactive' });
        }

        const rawBody = req.rawBody;
        if (!Buffer.isBuffer(rawBody)) {
            return res.status(400).json({ error: 'Invalid JSON payload' });
        }

        const sig = req.headers['x-wolt-signature'] || '';

        const signatureCheck = verifySignature(rawBody, sig, channel.webhookSecret);
        if (signatureCheck.configError) {
            console.error('[Wolt] Webhook secret is not configured correctly.');
            return res.status(503).json({ error: 'Webhook misconfigured: missing or placeholder secret' });
        }

        if (!signatureCheck.ok) {
            await logInvalidSignature('wolt', signatureCheck.reason, req);
            return res.status(403).json({ error: 'Invalid signature' });
        }

        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        } catch {
            return res.status(400).json({ error: 'Invalid JSON payload' });
        }

        const normalized = normalizeWoltOrder(payload);

        const result = await createOrderFromAggregator(normalized, 'WOLT');
        if (!result.created) {
            return res.status(200).json({ status: 'skipped', reason: result.reason, externalId: normalized.externalId });
        }

        res.json({ status: 'accepted', orderId: result.order.id });
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

    const unmatchedPosExternalIds = [...new Set(
        normalized.items
            .map(item => item.posExternalId)
            .filter(id => id !== null && id !== undefined && !productMap.has(id))
    )];

    if (unmatchedPosExternalIds.length > 0) {
        console.warn(`[Aggregator] ${source} unmapped posExternalId values:`, unmatchedPosExternalIds);
    }

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

    const validItems = items.filter(i => i.productId && i.productSizeId);

    if (validItems.length === 0) {
        console.warn(
            `[Aggregator] Skipping ${source} order ${normalized.externalId}: no valid items after product mapping`,
            { unmatchedPosExternalIds }
        );

        return {
            created: false,
            reason: 'no_valid_items',
        };
    }

    const calculatedSubtotal = validItems.reduce((sum, item) => {
        return sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 0);
    }, 0);

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
            subtotal: calculatedSubtotal,
            discount: 0,
            total: calculatedSubtotal,
            restaurantId: restaurant?.id || null,
            items: {
                create: validItems
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
        orderId: order.id, source, total: order.total,
    }, { source }).catch(() => { });

    // Auto-forward to POS (non-blocking)
    pushToPos(order).catch(err => console.error(`[PosSync] Auto-forward failed:`, err));

    // Notify manager (non-blocking)
    notifyNewOrder(order).catch(err => console.error(`[Telegram] Notify error:`, err));

    return { created: true, order };
}

module.exports = router;
