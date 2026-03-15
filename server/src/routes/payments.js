const express = require('express');
const router = express.Router();
const { verifyWebhookSignature, isWebhookSecretConfigured } = require('../services/paymentService');
const { sendOrderAlert } = require('../services/notificationService');
const { appendEvent, EventTypes } = require('../services/eventService');

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
    const signature = req.headers['content-signature'];
    const rawBody = req.rawBody; // raw buffer from express.json verify

        if (!isWebhookSecretConfigured()) {
            console.error('[Webhook] BEPAID_WEBHOOK_SECRET is not configured. Rejecting webhook.');
            return res.status(500).json({ error: 'Webhook verification misconfigured' });
        }

        // 1. Verify HMAC Signature
        const verification = verifyWebhookSignature(rawBody, signature);
        if (!verification.isValid) {
            console.warn(`[Webhook] Invalid bePaid signature (reason: ${verification.reason})`);
            return res.status(401).json({ error: 'Invalid signature' });
        }

        const payloadString = rawBody?.toString?.();
        if (!payloadString) {
            console.warn('[Webhook] Rejected webhook: empty payload');
            return res.status(400).json({ error: 'Malformed payload' });
        }

        let payload;
        try {
            payload = JSON.parse(payloadString);
        } catch (parseError) {
            console.warn('[Webhook] Rejected webhook: invalid JSON payload');
            return res.status(400).json({ error: 'Malformed payload' });
        }
        const transaction = payload.transaction;

        if (!transaction) {
            console.warn('[Webhook] Rejected webhook: missing transaction object');
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

                const updatedOrder = await prisma.$transaction(async (tx) => {
                    // A. Update Order Status
                    const updated = await tx.order.update({
                        where: { externalOrderId },
                        data: { status: 'CONFIRMED' }, // Moving to confirmed after payment
                        include: { items: { include: { product: true, productSize: true, modifiers: { include: { modifier: true } } } } }
                    });

                    // B. Log Event
                    await appendEvent(
                        EventTypes.PAYMENT_RECEIVED,
                        'Order',
                        externalOrderId,
                        { transactionId: transaction.uid, amount: transaction.amount },
                        { restaurantId: order.restaurantId },
                        `pay_${externalOrderId}_${Date.now()}`,
                        tx
                    );

                    return updated;
                });

                console.log(`[Webhook] Order ${updatedOrder.orderNumber} marked as PAID/CONFIRMED`);

                // C. Notify Managers via Telegram (since it's now fully paid)
                await sendOrderAlert(updatedOrder);
            }
        } else if (status === 'failed' || status === 'declined') {
            // Log failed payment event
            await appendEvent(
                EventTypes.PAYMENT_FAILED,
                'Order',
                externalOrderId,
                { reason: transaction.message },
                null,
                `payfail_${externalOrderId}_${Date.now()}`
            );
        }

        // Always reply 200 OK to acknowledge receipt
        res.status(200).send('OK');

    } catch (error) {
        console.error('[Webhook Processing Error]', error.message);
        res.status(500).send('Internal Error');
    }
});

module.exports = router;
