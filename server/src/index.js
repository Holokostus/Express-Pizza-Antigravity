// ============================================================
// Express Pizza — Server Entry Point (Sprint 1: SaaS Platform)
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./lib/prisma');
const PORT = process.env.PORT || 3000;

// ---- Middleware ----
app.use(cors());
app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Serve frontend static files from the parent directory
app.use(express.static(path.join(__dirname, '..', '..')));

// ---- Import Routes ----
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const aggregatorRoutes = require('./routes/aggregators');

// ---- Import Services ----
const { generateMenuJsonLd } = require('./services/seoService');
const { getEventsSince, syncBatch, getLatestSequence } = require('./services/eventService');
const { retryFailedSyncs } = require('./services/posSyncService');
const stockService = require('./services/stockService');
const kdsService = require('./services/kdsService');
const { calculateETA, checkSpillover, createYandexDelivery } = require('./services/etaService');
const printerService = require('./services/printerService');

// ---- Mount Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/aggregators', aggregatorRoutes);

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
            telegram: process.env.TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE' ? 'configured' : 'stub',
            bepaid: process.env.BEPAID_SECRET_KEY !== 'YOUR_SECRET_KEY' ? 'configured' : 'stub',
            iiko: process.env.IIKO_API_LOGIN !== 'YOUR_IIKO_LOGIN' ? 'configured' : 'stub',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
    }
});

// ---- Menu API (with КБЖУ + allergens) ----
app.get('/api/menu', async (req, res) => {
    try {
        const { category } = req.query;
        const where = { isAvailable: true };
        if (category) {
            const cat = await prisma.category.findUnique({ where: { slug: category } });
            if (cat) where.categoryId = cat.id;
        }
        const products = await prisma.product.findMany({
            where,
            include: {
                sizes: { orderBy: { price: 'asc' } },
                category: true,
                modifiers: true,
            },
            orderBy: { sortOrder: 'asc' },
        });
        res.json(products);
    } catch (err) {
        res.status(500).json({ error: 'Ошибка загрузки меню' });
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
app.post('/api/stock/out', async (req, res) => {
    try {
        const { productId, restaurantId, reason } = req.body;
        await stockService.setOutOfStock(productId, restaurantId, reason);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stock/back', async (req, res) => {
    try {
        const { productId, restaurantId } = req.body;
        await stockService.setBackInStock(productId, restaurantId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/stock/stop-list/:restaurantId', async (req, res) => {
    try {
        const list = await stockService.getStopList(parseInt(req.params.restaurantId));
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- POS Sync Retry ----
app.post('/api/pos/retry', async (req, res) => {
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

// ---- 404 for unknown API routes ----
app.all('/api/(.*)', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// ---- KDS API ----
// Get active orders for kitchen display
app.get('/api/kds/:restaurantId/orders', async (req, res) => {
    try {
        const orders = await kdsService.getActiveOrders(parseInt(req.params.restaurantId));
        res.json(orders);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update order status (from KDS or admin)
app.post('/api/kds/status', async (req, res) => {
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
app.post('/api/print/service', async (req, res) => {
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

app.post('/api/print/kitchen', async (req, res) => {
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

app.post('/api/print/reprint/:receiptId', async (req, res) => {
    try {
        const result = await printerService.reprint(parseInt(req.params.receiptId));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---- Start Server (HTTP + WebSocket) ----
const http = require('http');

const server = http.createServer(app);

// Initialize WebSocket for Kitchen Display System
kdsService.initKDSWebSocket(server);

server.listen(PORT, () => {
    console.log(`\n🍕 Express Pizza SaaS API v3 — http://localhost:${PORT}`);
    console.log(`📋 Health:       /api/health`);
    console.log(`📦 Menu:         /api/menu`);
    console.log(`🔐 Auth:         /api/auth/send-sms`);
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

// Graceful shutdown
process.on('SIGINT', async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
});
