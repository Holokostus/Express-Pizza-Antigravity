// ============================================================
// Express Pizza — Server Entry Point (Sprint 1: SaaS Platform)
// ============================================================

require('dotenv').config();

const { validateEnv } = require('./config/env');
validateEnv();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const prisma = require('./lib/prisma');
const { products } = require('../prisma/menu-data');
const PORT = process.env.PORT || 3000;

const app = express();

// ---- Middleware ----
app.use(cors());
app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Serve frontend static files.
// In local development files live in the repo root; in Docker they are copied to /app/public.
const localStaticDir = path.join(__dirname, '..', '..');
const dockerStaticDir = path.join(__dirname, '..', 'public');
const staticDir = fs.existsSync(path.join(dockerStaticDir, 'index.html'))
    ? dockerStaticDir
    : localStaticDir;

app.use(express.static(staticDir));

// ---- Import Routes ----
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const aggregatorRoutes = require('./routes/aggregators');
const adminRoutes = require('./routes/admin');
const menuRoutes = require('./routes/menu');
const promotionsRoutes = require('./routes/promotions');

// ---- Import Services ----
const { generateMenuJsonLd } = require('./services/seoService');
const { getEventsSince, syncBatch, getLatestSequence } = require('./services/eventService');
const { retryFailedSyncs } = require('./services/posSyncService');
const stockService = require('./services/stockService');
const kdsService = require('./services/kdsService');
const { calculateETA, checkSpillover, createYandexDelivery } = require('./services/etaService');
const printerService = require('./services/printerService');
const { triggerImageFetchJobByAdmin, isImageFetchEndpointEnabled, refetchBadProductImages, JobConflictError } = require('./services/adminImageFetchService');

const rateLimit = require('express-rate-limit');
const { requireAuth, checkRole } = require('./middleware/auth');

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Слишком много запросов, пожалуйста, попробуйте позже.' }
});

const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: { error: 'Слишком много попыток входа. Подождите 1 минуту.' }
});

const imageFetchLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 1,
    keyGenerator: (req) => String(req.user?.userId || req.ip),
    message: { error: 'Запуск обновления изображений доступен не чаще одного раза в 10 минут.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ---- Mount Routes ----
app.use('/api/', globalLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/aggregators', aggregatorRoutes);
app.use('/api/admin', requireAuth, checkRole(['ADMIN']), adminRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/promotions', promotionsRoutes);



app.get('/api/refetch-bad-images', async (req, res) => {
    res.json({ success: true, message: 'Бракованные фото отправлены на перекачку' });

    setImmediate(async () => {
        try {
            await refetchBadProductImages();
        } catch (error) {
            console.error('❌ Failed to re-fetch bad product images:', error);
        }
    });
});


// ---- Health Check ----
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        const [productCount, categoryCount, orderCount, eventCount] = await Promise.all([
            prisma.product.count(),
            prisma.category.count(),
            prisma.order.count(),
            prisma.eventLog.count(),
        ]);
        res.json({
            status: 'ok',
            database: 'connected',
            products: productCount,
            categories: categoryCount,
            orders: orderCount,
            events: eventCount,
            telegram: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'missing',
            bepaid: process.env.BEPAID_SECRET_KEY ? 'configured' : 'missing',
            iiko: process.env.IIKO_API_LOGIN ? 'configured' : 'missing',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
    }
});

app.get('/api/fetch-images', requireAuth, checkRole(['ADMIN']), async (req, res) => {
    res.json({
        success: true,
        message: 'Процесс поиска картинок запущен в фоновом режиме. Обновите страницу через пару минут.',
    });

    try {
        await triggerImageFetchJobByAdmin({
            initiatorId: req.user.userId,
            initiatorRole: req.user.role,
            ipAddress: req.ip,
        });

        return res.json({
            success: true,
            message: 'Процесс поиска картинок запущен в фоновом режиме. Обновите страницу через пару минут.',
        });
    } catch (error) {
        if (error instanceof JobConflictError) {
            return res.status(error.statusCode).json({ error: 'Фоновая задача уже выполняется. Повторите позже.' });
        }

        if (error.statusCode === 503) {
            return res.status(503).json({ error: error.message });
        }

        console.error('❌ Failed to trigger image fetch job:', error);
        return res.status(500).json({ error: 'Не удалось запустить задачу обновления изображений.' });
    }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
        res.json(categories);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки категорий' });
    }
});

app.get('/api/fix-descriptions', async (req, res) => {
    try {
        const targetProducts = products.filter((product) => (
            ['drinks', 'juice', 'togo'].includes(product.categorySlug) && Boolean(product.description)
        ));

        for (const product of targetProducts) {
            await prisma.product.updateMany({
                where: { name: product.name },
                data: { description: product.description },
            });
        }

        res.json({ success: true, message: 'Описания товаров успешно обновлены в базе данных!' });
    } catch (err) {
        console.error('❌ Ошибка обновления описаний товаров:', err);
        res.status(500).json({ success: false, error: 'Не удалось обновить описания товаров.' });
    }
});

// ---- Allergens API ----
app.get('/api/allergens', async (req, res) => {
    try {
        const allergens = await prisma.allergen.findMany({ orderBy: { id: 'asc' } });
        res.json(allergens);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки аллергенов' });
    }
});

// ---- Restaurants API ----
app.get('/api/restaurants', async (req, res) => {
    try {
        const restaurants = await prisma.restaurant.findMany({
            where: { isActive: true },
            select: { id: true, name: true, address: true, phone: true, posType: true },
        });
        res.json(restaurants);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки ресторанов' });
    }
});

// ---- SEO: JSON-LD for rich snippets ----

app.get('/api/seo/jsonld', async (req, res) => {
    try {
        const jsonLd = await generateMenuJsonLd();
        res.json(jsonLd);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка генерации JSON-LD' });
    }
});

// ---- Event Sync API (for Local Node) ----
app.get('/api/sync/events', async (req, res) => {
    try {
        const since = BigInt(req.query.since || 0);
        const limit = parseInt(req.query.limit) || 100;
        const events = await getEventsSince(since, limit);
        const latest = await getLatestSequence();
        res.json({
            events: events.map(e => ({
                ...e,
                sequenceNum: e.sequenceNum.toString(), // BigInt → string for JSON
            })),
            latestSequence: latest.toString(),
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения событий' });
    }
});

app.post('/api/sync/events', async (req, res) => {
    try {
        const { events } = req.body;
        if (!events || !Array.isArray(events)) {
            return res.status(400).json({ error: 'Массив events обязателен' });
        }
        const result = await syncBatch(events);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка синхронизации событий' });
    }
});

// ---- Stock Management (stop-list) ----
app.post('/api/stock/out', requireAuth, checkRole(['ADMIN']), async (req, res) => {
    try {
        const { productId, restaurantId, reason } = req.body;
        await stockService.setOutOfStock(productId, restaurantId, reason);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stock/back', requireAuth, checkRole(['ADMIN']), async (req, res) => {
    try {
        const { productId, restaurantId } = req.body;
        await stockService.setBackInStock(productId, restaurantId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stock/stop-list/:restaurantId', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
    try {
        const list = await stockService.getStopList(parseInt(req.params.restaurantId));
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- POS Sync Retry ----
app.post('/api/pos/retry', requireAuth, checkRole(['ADMIN']), async (req, res) => {
    try {
        const result = await retryFailedSyncs();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Static legal pages ----
app.get('/oferta', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'oferta.html'));
});

// ---- KDS API ----
// Get active orders for kitchen display
app.get('/api/kds/:restaurantId/orders', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
    try {
        const orders = await kdsService.getActiveOrders(parseInt(req.params.restaurantId));
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update order status (from KDS or admin)
app.post('/api/kds/status', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
    try {
        const { orderId, status } = req.body;
        await kdsService.updateOrderStatus(orderId, status);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- ETA API ----
app.post('/api/eta/calculate', async (req, res) => {
    try {
        const eta = await calculateETA(req.body);
        res.json(eta);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/eta/spillover/:restaurantId', async (req, res) => {
    try {
        const result = await checkSpillover(parseInt(req.params.restaurantId));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Printer API ----
app.post('/api/print/service', requireAuth, checkRole(['ADMIN']), async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: { include: { product: true, productSize: true, modifiers: { include: { modifier: true } } } },
                restaurant: true,
            },
        });
        if (!order) return res.status(404).json({ error: 'Заказ не найден' });
        const result = await printerService.printServiceReceipt(order);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/print/kitchen', requireAuth, checkRole(['ADMIN', 'COOK']), async (req, res) => {
    try {
        const { orderId } = req.body;
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: { include: { product: true, productSize: true, modifiers: { include: { modifier: true } } } },
                restaurant: true,
            },
        });
        if (!order) return res.status(404).json({ error: 'Заказ не найден' });
        const result = await printerService.printKitchenTicket(order);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/print/reprint/:receiptId', requireAuth, checkRole(['ADMIN']), async (req, res) => {
    try {
        const result = await printerService.reprint(parseInt(req.params.receiptId));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- 404 for unknown API routes ----
app.all('/api/(.*)', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// ---- Start Server (HTTP + WebSocket) ----
const http = require('http');

const server = http.createServer(app);

// Initialize WebSocket for Kitchen Display System
kdsService.initKDSWebSocket(server);

async function startServer() {
    server.listen(PORT, () => {
        console.log(`\n🍕 Express Pizza SaaS API v3 — http://localhost:${PORT}`);
        console.log(`📋 Health:       /api/health`);
        console.log(`📦 Menu:         /api/menu`);
        console.log(`🔐 Auth:         /api/auth/send-email`);
        console.log(`🛒 Cart:         /api/orders/calculate`);
        console.log(`💳 Payments:     /api/payments/webhook`);
        console.log(`📡 Aggregators:  /api/aggregators/{delivio,wolt}/webhook`);
        console.log(`🔄 Event Sync:   /api/sync/events`);
        console.log(`👨‍🍳 KDS:          /api/kds/:restaurantId/orders`);
        console.log(`⏱️  ETA:          /api/eta/calculate`);
        console.log(`🖨️  Print:        /api/print/{service,kitchen}`);
        console.log(`🔌 WebSocket:    ws://localhost:${PORT}/ws/kds?restaurantId=1`);
        console.log(`🔍 SEO JSON-LD:  /api/seo/jsonld`);
        console.log(`📄 Оферта:       /oferta\n`);
    });
}

startServer();

// Graceful shutdown
const shutdown = async (signal) => {
    console.log(`\n[${signal}] Initiating graceful shutdown...`);
    server.close(async () => {
        console.log('HTTP server closed.');
        await prisma.$disconnect();
        console.log('Database connection closed.');
        process.exit(0);
    });
    
    // Fallback if it hangs
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
    console.error('[Uncaught Exception]', error);
    shutdown('uncaughtException');
});
