// ============================================================
// Express Pizza — KDS API Router (Sprint 5)
// ============================================================

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { updateOrderStatus } = require('../services/kdsService');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/kds/:restaurantId/orders
 * Resync endpoint for KDS tablets
 * Returns all active orders (NEW, CONFIRMED, COOKING, BAKING)
 */
router.get('/:restaurantId/orders', async (req, res) => {
    try {
        const restaurantId = parseInt(req.params.restaurantId);

        if (isNaN(restaurantId)) {
            return res.status(400).json({ error: 'Invalid restaurantId' });
        }

        const activeOrders = await prisma.order.findMany({
            where: {
                restaurantId: restaurantId,
                status: {
                    in: ['NEW', 'CONFIRMED', 'COOKING', 'BAKING']
                }
            },
            orderBy: { createdAt: 'asc' }, // Oldest first (FIFO queue for kitchen)
            include: {
                items: {
                    include: {
                        product: { select: { name: true } },
                        productSize: { select: { label: true } },
                        modifiers: {
                            include: {
                                modifier: { select: { name: true, isRemoval: true, kdsHighlight: true, kdsColor: true } }
                            }
                        }
                    }
                }
            }
        });

        res.json({ success: true, orders: activeOrders });

    } catch (err) {
        console.error('[KDS API] Failed to fetch active orders:', err);
        res.status(500).json({ error: 'Failed to load KDS state' });
    }
});

/**
 * PATCH /api/kds/status (HTTP fallback to WebSocket)
 */
router.patch('/status', async (req, res) => {
    try {
        const { orderId, status } = req.body;

        if (!orderId || !status) return res.status(400).json({ error: 'orderId and status required' });

        await updateOrderStatus(orderId, status);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});

module.exports = router;
