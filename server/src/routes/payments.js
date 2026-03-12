const express = require('express');
const router = express.Router();

// ============================================================
// Express Pizza — Payments Webhook Router (Sprint 3)
// ============================================================

const prisma = require('../lib/prisma');

/**
 * POST /api/payments/webhook
 * Receives synchronous callbacks from bePaid upon payment completion
 */
// Use express.text() or raw-body to get exactly the raw payload for HMAC verification
router.post('/webhook', async (req, res) => {
    try {
        const signature = req.headers['content-signature'];
        const rawBody = req.rawBody; // raw buffer from express.json verify

        // 1. Verify HMAC Signature
        if (!verifyWebhookSignature(rawBody, signature)) {
            console.warn('[Webhook] Invalid bePaid signature!');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const payload = JSON.parse(rawBody);
        const transaction = payload.transaction;

        if (!transaction) {
            return res.status(400).json({ error: 'Malformed payload' });
        }

        const externalOrderId = transaction.tracking_id;
        const status = transaction.status;

        console.log(`[Webhook] bePaid status update for ${externalOrderId}: ${status}`);

        // 2. Process Successful Payment
        if (status === 'successful') {
            const order = await prisma.order.findUnique({
                where: { externalOrderId },
                include: { items: { include: { product: true, productSize: true, modifiers: { include: { modifier: true } } } } }
            });

            if (!order) {
                console.error(`[Webhook] Order ${externalOrderId} not found in DB`);
                return res.status(404).send('Order not found');
            }

            // Only update if not already processed
            if (order.status !== 'CONFIRMED' && order.status !== 'COOKING') {

                const [updatedOrder, event] = await prisma.$transaction([
                    // A. Update Order Status
                    prisma.order.update({
                        where: { externalOrderId },
                        data: { status: 'CONFIRMED' }, // Moving to confirmed after payment
                        include: { items: { include: { product: true, productSize: true, modifiers: { include: { modifier: true } } } } }
                    }),
                    // B. Log Event
                    prisma.eventLog.create({
                        data: {
                            eventType: 'PAYMENT_RECEIVED',
                            aggregateType: 'Order',
                            aggregateId: externalOrderId,
                            idempotencyKey: `pay_${externalOrderId}_${Date.now()}`,
                            restaurantId: order.restaurantId,
                            payload: { transactionId: transaction.uid, amount: transaction.amount }
                        }
                    })
                ]);

                console.log(`[Webhook] Order ${updatedOrder.orderNumber} marked as PAID/CONFIRMED`);

                // C. Notify Managers via Telegram (since it's now fully paid)
                await sendOrderAlert(updatedOrder);
            }
        } else if (status === 'failed' || status === 'declined') {
            // Log failed payment event
            await prisma.eventLog.create({
                data: {
                    eventType: 'PAYMENT_FAILED',
                    aggregateType: 'Order',
                    aggregateId: externalOrderId,
                    idempotencyKey: `payfail_${externalOrderId}_${Date.now()}`,
                    payload: { reason: transaction.message }
                }
            });
        }

        // Always reply 200 OK to acknowledge receipt
        res.status(200).send('OK');

    } catch (error) {
        console.error('[Webhook Processing Error]', error);
        res.status(500).send('Internal Error');
    }
});

module.exports = router;
