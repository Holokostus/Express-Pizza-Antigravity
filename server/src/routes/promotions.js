const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const promotions = await prisma.promotion.findMany({
            where: { isActive: true },
            orderBy: { id: 'asc' },
        });

        res.json(promotions);
    } catch (error) {
        console.error('[Promotions API] Failed to load promotions:', error);
        res.status(500).json({ error: 'Ошибка загрузки акций' });
    }
});

module.exports = router;
