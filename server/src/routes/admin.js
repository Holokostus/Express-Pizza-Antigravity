const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/analytics', async (req, res) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const startOf7DayWindow = new Date(startOfToday);
        startOf7DayWindow.setDate(startOf7DayWindow.getDate() - 6);

        const [todayOrders, loyaltyDebtResult, chartOrders] = await Promise.all([
            prisma.order.findMany({
                where: {
                    status: 'COMPLETED',
                    createdAt: {
                        gte: startOfToday,
                        lte: now
                    }
                },
                select: {
                    total: true
                }
            }),
            prisma.pointsBalance.aggregate({
                _sum: {
                    currentBalance: true
                }
            }),
            prisma.order.findMany({
                where: {
                    status: 'COMPLETED',
                    createdAt: {
                        gte: startOf7DayWindow,
                        lte: now
                    }
                },
                select: {
                    createdAt: true,
                    total: true
                },
                orderBy: {
                    createdAt: 'asc'
                }
            })
        ]);

        const revenueToday = todayOrders.reduce((sum, order) => sum + Number(order.total), 0);
        const completedOrdersToday = todayOrders.length;
        const aov = completedOrdersToday > 0 ? revenueToday / completedOrdersToday : 0;
        const loyaltyDebt = loyaltyDebtResult._sum.currentBalance || 0;

        const revenueByDayMap = new Map();
        for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
            const day = new Date(startOf7DayWindow);
            day.setDate(startOf7DayWindow.getDate() + dayOffset);
            const dayKey = day.toISOString().split('T')[0];
            revenueByDayMap.set(dayKey, 0);
        }

        for (const order of chartOrders) {
            const dayKey = order.createdAt.toISOString().split('T')[0];
            revenueByDayMap.set(dayKey, (revenueByDayMap.get(dayKey) || 0) + Number(order.total));
        }

        const chart = Array.from(revenueByDayMap.entries()).map(([date, revenue]) => ({
            date,
            revenue: Number(revenue.toFixed(2))
        }));

        res.json({
            revenueToday: Number(revenueToday.toFixed(2)),
            aov: Number(aov.toFixed(2)),
            completedOrdersToday,
            loyaltyDebt,
            chart
        });
    } catch (error) {
        console.error('[Admin Analytics] Error:', error);
        res.status(500).json({ error: 'Ошибка загрузки аналитики' });
    }
});

module.exports = router;
