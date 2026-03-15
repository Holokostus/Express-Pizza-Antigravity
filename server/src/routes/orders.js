// ============================================================
// Express Pizza — Orders Router (Sprint 2)
// ============================================================

const express = require('express');
const crypto = require('crypto');
const { calculateCartTotal } = require('../services/cartService');
const { createPaymentSession } = require('../services/paymentService');
const { sendOrderAlert } = require('../services/notificationService');
const { broadcastOrderToKDS, updateOrderStatus } = require('../services/kdsService');
const { requireAuth, requireRole } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { z } = require('zod');
const { sendTelegramMessage } = require('../services/telegramService');

const router = express.Router();

/**
 * POST /api/orders/calculate
 * Calculates authoritative cart totals based on DB prices.
 * Safe to call without JWT.
 */
router.post('/calculate', async (req, res) => {
    try {
        const { items, promoCodeString } = req.body;

        if (!items || items.length === 0) {
            return res.json({ subtotal: 0, discount: 0, total: 0, items: [] });
        }

        const cartResult = await calculateCartTotal(items, promoCodeString);
        res.json({
            subtotal: cartResult.subtotal,
            discount: cartResult.discount,
            total: cartResult.total,
            promo: cartResult.validPromo ? { label: cartResult.validPromo.code } : null,
            items: cartResult.validatedItems.map(item => ({
                productId: item.productId,
                name: item.productName,
                image: item.productImage,
                productSizeId: item.productSizeId,
                sizeLabel: item.sizeLabel,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                note: item.note,
                modifiers: item.validatedModifiers
            })),
            errors: []
        });

    } catch (error) {
        console.error('[Calculate Error]', error);
        res.status(400).json({ error: error.message || 'Calculation failed' });
    }
});

/**
 * POST /api/orders/checkout
 * Secure Checkout & Event Sourcing entry point
 * Requires JWT Token from SMS Auth
 */
// Zod validation schema
const checkoutSchema = z.object({
    customerName: z.string().min(1, "Name is required"),
    customerPhone: z.string().min(1, "Phone is required"),
    address: z.string().min(1).optional(),
    customerAddress: z.string().min(1).optional(),
    items: z.array(z.any()).min(1, "Cart is empty"),
    promoCodeString: z.string().optional(),
    restaurantId: z.union([z.number().int(), z.string().regex(/^\d+$/).transform((v) => parseInt(v, 10))]).optional(),
    source: z.string().optional(),
    payment: z.string().optional(),
    paymentMethod: z.string().optional(),
    paymentStatus: z.string().optional(),
    transactionId: z.string().optional(),
    spentPoints: z.number().int().nonnegative().optional(),
    clientOrderId: z.string().optional()
}).refine(data => data.address || data.customerAddress, {
    message: "Address is required",
    path: ["address"]
});

router.post('/checkout', requireAuth, async (req, res) => {
    try {
        const validation = checkoutSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ error: 'Invalid input data', details: validation.error.issues });
        }

        const {
            customerName,
            customerAddress,
            address,
            items,
            promoCodeString,
            restaurantId,
            source = 'WEBSITE',
            payment = 'BEPAID_ONLINE',
            paymentMethod,
            paymentStatus,
            transactionId,
            spentPoints = 0,
            clientOrderId
        } = req.body;

        const finalAddress = customerAddress || address;

        // Check auth for spending points
        if (spentPoints > 0 && !req.user?.userId) {
            return res.status(400).json({ error: 'Только авторизованные пользователи могут тратить баллы' });
        }

        // Extract verified phone from JWT token
        const customerPhoneJwt = req.user?.phone;
        const customerPhone = customerPhoneJwt || req.body.customerPhone;

        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // 1. Secure Server-Side Cart Calculation
        const cartResult = await calculateCartTotal(items, promoCodeString);


        const normalizedRestaurantId = Number.isFinite(Number(restaurantId)) ? Number(restaurantId) : null;
        const restaurant = normalizedRestaurantId
            ? await prisma.restaurant.findUnique({ where: { id: normalizedRestaurantId } })
            : await prisma.restaurant.findFirst({ where: { isActive: true } });

        // 2. Generate Idempotency Key
        let idempotencyKey;
        if (clientOrderId) {
            idempotencyKey = "checkout_" + clientOrderId;
        } else {
            const timeWindow = Math.floor(Date.now() / 10000); // 10 second window
            const hashInput = `${customerPhone}-${JSON.stringify(items)}-${timeWindow}`;
            idempotencyKey = crypto.createHash('sha256').update(hashInput).digest('hex');
        }

        // Check if EventLog already has this idempotency key (deduplication)
        const duplicateEvent = await prisma.eventLog.findUnique({
            where: { idempotencyKey }
        });

        if (duplicateEvent) {
            console.log(`[Order] Debounced duplicate order`);
            return res.status(200).json({
                success: true,
                message: 'Order already processed',
                orderId: duplicateEvent.aggregateId // Returned UUID of existing order
            });
        }

        // Generate UUID for the order (aggregateId)
        const externalOrderId = crypto.randomUUID();

        // 3. Prisma $transaction (Atomicity)
        const [createdOrder, createdEvent] = await prisma.$transaction(async (tx) => {
            
            let finalSpentPoints = Math.min(spentPoints || 0, Math.floor(cartResult.total));
            
            if (finalSpentPoints > 0 && req.user?.userId) {
                // Ensure atomic deduction to prevent TOCTOU
                const updatedBalance = await tx.pointsBalance.updateMany({
                    where: { 
                        userId: req.user.userId,
                        currentBalance: { gte: finalSpentPoints }
                    },
                    data: {
                        currentBalance: { decrement: finalSpentPoints }
                    }
                });

                if (updatedBalance.count === 0) {
                    throw new Error('Недостаточно баллов для списания');
                }

                // Log deduction in Ledger
                await tx.pointsLedger.create({
                    data: {
                        userId: req.user.userId,
                        amount: -finalSpentPoints,
                        transactionType: 'REDEEM',
                        idempotencyKey: `redeem_${idempotencyKey}`
                    }
                });
            } else {
                finalSpentPoints = 0;
            }

            const finalTotal = Math.max(0, cartResult.total - finalSpentPoints);

            // A. Create the Order and its items
            const order = await tx.order.create({
                data: {
                    externalOrderId,
                    source,
                    customerName,
                    customerPhone,
                    customerAddress: finalAddress,
                    payment,
                    paymentMethod: paymentMethod || null,
                    paymentStatus: paymentStatus || null,
                    transactionId: transactionId || null,
                    status: 'NEW',
                    subtotal: cartResult.subtotal,
                    discount: cartResult.discount + finalSpentPoints,
                    total: finalTotal,
                    restaurantId: restaurant?.id ?? null,
                    promoCodeId: cartResult.validPromo ? cartResult.validPromo.id : null,
                    // Create items and their modifiers in nested write
                    items: {
                        create: cartResult.validatedItems.map(item => ({
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            note: item.note,
                            productId: item.productId,
                            productSizeId: item.productSizeId,
                            modifiers: {
                                create: item.validatedModifiers // insert into OrderItemModifier
                            }
                        }))
                    }
                },
                include: {
                    items: { include: { product: true, modifiers: true } }
                }
            });

            // B. Increment Promo Code usage (if valid)
            if (cartResult.validPromo) {
                await tx.promoCode.update({
                    where: { id: cartResult.validPromo.id },
                    data: { usageCount: { increment: 1 } }
                });
            }

            // C. Create EventLog entry (Event Sourcing)
            const event = await tx.eventLog.create({
                data: {
                    eventType: 'ORDER_PLACED',
                    aggregateType: 'Order',
                    aggregateId: externalOrderId,
                    idempotencyKey,
                    restaurantId: restaurant?.id ?? null,
                    payload: order // The snapshot of the order at creation time
                }
            });

            return [order, event];
        });

        // 4. Integrations: Payments & Notifications
        let checkoutUrl = null;

        if ((payment === 'BEPAID_ONLINE' || payment === 'OPLATI_QR') && paymentStatus !== 'paid') {
            // Generate bePaid payment URL
            checkoutUrl = await createPaymentSession(createdOrder.externalOrderId, createdOrder.total, {
                name: customerName,
                phone: customerPhone
            });
        } else {
            // Cash / Terminal on delivery: Not paid online, notify the manager immediately
            // (For online payments, the webhook will trigger this notification instead)
            await sendOrderAlert(createdOrder);
        }



        try {
            const message = `🚨 НОВЫЙ ЗАКАЗ #${createdOrder.id}!\nСумма: ${createdOrder.total} BYN\nОплата: ${createdOrder.paymentMethod}`;
            if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                await sendTelegramMessage(message);
            }
        } catch (telegramError) {
            console.error('[Telegram] Order alert failed:', telegramError.message);
        }

        // Push order to Kitchen Display System instantly for ALL orders
        if (restaurant?.id) {
            broadcastOrderToKDS(restaurant.id, createdOrder);
        }

        console.log(`[Order] Successfully created! externalOrderId: ${externalOrderId}, Total: ${cartResult.total} BYN`);

        // Return success with order summary
        res.status(201).json({
            success: true,
            orderId: createdOrder.externalOrderId,
            orderNumber: createdOrder.orderNumber,
            total: createdOrder.total,
            status: createdOrder.status,
            checkoutUrl, // Will be null for CASH
            message: 'Order placed, event logged'
        });

    } catch (error) {
        console.error('[Checkout Error]', error);
        res.status(400).json({ error: error.message || 'Checkout failed' });
    }
});

/**
 * GET /api/orders/my
 * Returns orders for the currently authenticated user
 */
router.get('/my', requireAuth, async (req, res) => {
    try {
        const phone = req.user.phone;
        const orders = await prisma.order.findMany({
            where: { customerPhone: phone },
            orderBy: { createdAt: 'desc' },
            include: {
                items: {
                    include: { product: true }
                }
            }
        });

        const formattedOrders = orders.map(o => ({
            id: o.id,
            timestamp: new Date(o.createdAt).getTime(),
            status: o.status,
            total: o.total,
            items: o.items.map(i => ({
                name: i.product?.name ?? 'Удаленный товар',
                quantity: i.quantity,
                price: i.unitPrice
            }))
        }));

        res.json({ success: true, orders: formattedOrders });
    } catch (err) {
        console.error('[My Orders] Error:', err);
        res.status(500).json({ error: 'Failed to fetch personal orders' });
    }
});

/**
 * GET /api/orders
 * Admin endpoint to list all orders
 */
router.get('/', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const orders = await prisma.order.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100, // Reasonable limit for MVP
            include: {
                items: {
                    include: {
                        product: { select: { name: true } },
                    }
                }
            }
        });

        // Format for frontend
        const formattedOrders = orders.map(o => ({
            id: o.id,
            timestamp: new Date(o.createdAt).getTime(),
            status: o.status,
            payment: o.payment,
            customer: {
                name: o.customerName,
                phone: o.customerPhone,
                address: o.customerAddress
            },
            items: o.items.map(i => ({
                name: i.product?.name ?? 'Удаленный товар',
                quantity: i.quantity,
                price: i.unitPrice
            }))
        }));

        res.json({ success: true, orders: formattedOrders });
    } catch (err) {
        console.error('[Admin Orders]', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

/**
 * PATCH /api/orders/:id/status
 * Admin endpoint to change order status
 */
router.patch('/:id/status', requireAuth, requireRole(['ADMIN']), async (req, res) => {
    try {
        const orderId = parseInt(req.params.id);
        const { status } = req.body;

        if (isNaN(orderId) || !status) {
            return res.status(400).json({ error: 'Invalid orderId or status' });
        }

        const statusMap = {
            'new': 'NEW',
            'cooking': 'COOKING',
            'baking': 'BAKING',
            'delivery': 'DELIVERY',
            'completed': 'COMPLETED',
            'cancelled': 'CANCELLED'
        };
        const dbStatus = statusMap[status.toLowerCase()] || status.toUpperCase();

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
                id: true,
                status: true,
                userId: true,
                total: true
            }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        await updateOrderStatus(orderId, dbStatus);

        res.json({ success: true, status: dbStatus });
    } catch (err) {
        console.error('[Admin Status Update]', err);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

module.exports = router;
