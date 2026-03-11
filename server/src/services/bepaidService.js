// ============================================================
// bePaid Webhook & Payment Service
// ============================================================
// Обрабатывает уведомления от платёжного шлюза bePaid.
// Документация: https://docs.bepaid.by/ru/webhooks
//
// Workflow:
// 1. Frontend → bePaid checkout (redirect/iframe)
// 2. bePaid обрабатывает карту → POST /api/payments/webhook
// 3. Мы верифицируем подпись → обновляем Order.status = PAID
// ============================================================

const crypto = require('crypto');
const prisma = require('../lib/prisma');

const BEPAID_SECRET_KEY = process.env.BEPAID_SECRET_KEY || 'test';
const BEPAID_WEBHOOK_SECRET = process.env.BEPAID_WEBHOOK_SECRET || 'test';

/**
 * Verify webhook signature from bePaid
 * bePaid sends: Authorization: Basic base64(shopId:secretKey)
 * or X-Bepaid-Signature header with HMAC-SHA256
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
    if (!signatureHeader || BEPAID_WEBHOOK_SECRET === 'YOUR_WEBHOOK_SECRET') {
        console.warn('[bePaid] Webhook signature verification skipped (test mode)');
        return true; // test mode — accept all
    }

    const expected = crypto
        .createHmac('sha256', BEPAID_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signatureHeader)
    );
}

/**
 * Process payment notification from bePaid.
 * Expected body (bePaid format):
 * {
 *   "transaction": {
 *     "uid": "...",
 *     "status": "successful" | "failed" | "incomplete",
 *     "type": "payment",
 *     "amount": 1890,         // kopecks (18.90 BYN = 1890)
 *     "currency": "BYN",
 *     "tracking_id": "order_42",  // our order ID
 *     ...
 *   }
 * }
 */
async function processPaymentWebhook(body) {
    const tx = body?.transaction;
    if (!tx) {
        return { success: false, error: 'Missing transaction data' };
    }

    const orderId = parseInt(tx.tracking_id?.replace('order_', ''));
    if (!orderId) {
        return { success: false, error: `Invalid tracking_id: ${tx.tracking_id}` };
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
        return { success: false, error: `Order #${orderId} not found` };
    }

    if (tx.status === 'successful') {
        // Mark as paid
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'COOKING' }, // Paid → immediately start cooking
        });

        console.log(`[bePaid] ✓ Payment confirmed for Order #${orderId}, amount: ${tx.amount / 100} ${tx.currency}`);
        return { success: true, orderId, newStatus: 'COOKING' };
    }

    if (tx.status === 'failed') {
        await prisma.order.update({
            where: { id: orderId },
            data: { status: 'CANCELLED' },
        });

        console.log(`[bePaid] ✗ Payment failed for Order #${orderId}`);
        return { success: true, orderId, newStatus: 'CANCELLED' };
    }

    // Pending / incomplete — do nothing for now
    console.log(`[bePaid] ⏳ Payment status "${tx.status}" for Order #${orderId}`);
    return { success: true, orderId, status: tx.status };
}

/**
 * Create bePaid checkout URL (stub — returns placeholder)
 * In production: POST to https://checkout.bepaid.by/ctp/api/checkouts
 */
async function createCheckout(order) {
    const amount = Math.round(Number(order.total) * 100); // BYN → kopecks

    console.log(`[bePaid] Creating checkout for Order #${order.id}, amount: ${amount} BYN kopecks`);

    // STUB: In production, make real API call here
    // const response = await fetch('https://checkout.bepaid.by/ctp/api/checkouts', { ... });

    return {
        checkoutUrl: `https://checkout.bepaid.by/v2/checkout?token=stub_${order.id}_${Date.now()}`,
        token: `stub_token_${order.id}`,
    };
}

module.exports = { verifyWebhookSignature, processPaymentWebhook, createCheckout };
