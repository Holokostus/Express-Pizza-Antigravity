// ============================================================
// Express Pizza — Server Entry Point (Sprint 1: SaaS Platform)
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const prisma = require('./lib/prisma');
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

// Serve frontend static files from the parent directory
app.use(express.static(path.join(__dirname, '..', '..')));

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

// ---- Mount Routes ----
app.use('/api/', globalLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/aggregators', aggregatorRoutes);
app.use('/api/admin', requireAuth, checkRole(['ADMIN']), adminRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/promotions', promotionsRoutes);



// ---- Production Seed Trigger ----
app.get('/api/seed-db', async (req, res) => {
    try {
        await prisma.$transaction(async (tx) => {
            // Cleanup in FK-safe order
            await tx.orderItemModifier.deleteMany();
            await tx.orderItem.deleteMany();
            await tx.order.deleteMany();
            await tx.pointsLedger.deleteMany();
            await tx.pointsBalance.deleteMany();
            await tx.receipt.deleteMany();
            await tx.stockEvent.deleteMany();
            await tx.eventLog.deleteMany();
            await tx.kdsMetric.deleteMany();
            await tx.promoCode.deleteMany();
            await tx.productSize.deleteMany();
            await tx.productModifier.deleteMany();
            await tx.product.deleteMany();
            await tx.modifier.deleteMany();
            await tx.category.deleteMany();
            await tx.allergen.deleteMany();
            await tx.aggregatorChannel.deleteMany();
            await tx.restaurant.deleteMany();

            const restaurant = await tx.restaurant.create({
                data: {
                    name: 'Express Pizza — Партизанский',
                    address: 'г. Минск, пр-т Партизанский, 19',
                    phone: '+375445891111',
                    posType: 'IIKO',
                    posConfig: { apiLogin: '', orgId: '', terminalId: '' },
                    printerIp: '192.168.1.100',
                    printerPort: 9100,
                },
            });

            const allergens = [
                { slug: 'gluten', nameRu: 'Глютен', nameEn: 'Gluten', icon: '🌾' },
                { slug: 'eggs', nameRu: 'Яйца', nameEn: 'Eggs', icon: '🥚' },
                { slug: 'dairy', nameRu: 'Молочные', nameEn: 'Dairy', icon: '🥛' },
                { slug: 'nuts', nameRu: 'Орехи', nameEn: 'Tree nuts', icon: '🌰' },
                { slug: 'mustard', nameRu: 'Горчица', nameEn: 'Mustard', icon: '🟡' },
            ];
            await tx.allergen.createMany({ data: allergens });

            const categories = await Promise.all([
                tx.category.create({ data: { slug: 'pizza', name: 'Пицца', sortOrder: 1 } }),
                tx.category.create({ data: { slug: 'combo', name: 'Комбо & Акции', sortOrder: 2 } }),
                tx.category.create({ data: { slug: 'snacks', name: 'Закуски', sortOrder: 3 } }),
                tx.category.create({ data: { slug: 'sauce', name: 'Соусы', sortOrder: 4 } }),
                tx.category.create({ data: { slug: 'drinks', name: 'Напитки', sortOrder: 5 } }),
            ]);
            const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

            const products = [
                {
                    name: 'Пепперони',
                    description: 'Томатный соус, моцарелла, пепперони',
                    image: 'images/pepperoni.jpg',
                    categorySlug: 'pizza',
                    sortOrder: 1,
                    badge: { text: 'Хит', color: 'bg-primary text-white' },
                    calories: 260, proteins: 11.5, fats: 12.0, carbs: 26.5,
                    allergenSlugs: ['gluten', 'dairy'],
                    sizes: [
                        { label: '30 см', weight: '540г', price: 18.90 },
                        { label: '36 см', weight: '780г', price: 26.90 },
                        { label: '60 см', weight: '1500г', price: 44.90 },
                    ],
                },
                {
                    name: 'Маргарита',
                    description: 'Томатный соус, моцарелла, базилик, помидоры',
                    image: 'images/margherita.jpg',
                    categorySlug: 'pizza',
                    sortOrder: 2,
                    calories: 235, proteins: 9.8, fats: 9.5, carbs: 28.0,
                    allergenSlugs: ['gluten', 'dairy'],
                    sizes: [
                        { label: '30 см', weight: '490г', price: 15.90 },
                        { label: '36 см', weight: '720г', price: 22.90 },
                    ],
                },
                {
                    name: '4 Сыра',
                    description: 'Сливочный соус, моцарелла, дорблю, пармезан, чеддер',
                    image: 'images/4-cheese.jpg',
                    categorySlug: 'pizza',
                    sortOrder: 3,
                    calories: 290, proteins: 12.2, fats: 14.4, carbs: 27.1,
                    allergenSlugs: ['gluten', 'dairy'],
                    sizes: [
                        { label: '30 см', weight: '520г', price: 21.90 },
                        { label: '36 см', weight: '760г', price: 29.90 },
                    ],
                },
                {
                    name: 'Комбо Family Pack',
                    description: '2 больших пиццы 36см + 2 соуса + Coca-Cola 1л',
                    image: 'https://images.unsplash.com/photo-1590947132387-155cc02f3212?w=800&q=80',
                    categorySlug: 'combo',
                    sortOrder: 1,
                    badge: { text: '-25%', color: 'bg-green-500 text-white' },
                    calories: 310, proteins: 13, fats: 13, carbs: 30,
                    allergenSlugs: ['gluten', 'dairy'],
                    sizes: [{ label: 'Набор', weight: '~2.5кг', price: 49.90 }],
                },
                {
                    name: 'Картофель фри',
                    description: 'Хрустящий картофель фри с солью',
                    image: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=800&q=80',
                    categorySlug: 'snacks',
                    sortOrder: 1,
                    calories: 312, proteins: 3.4, fats: 15, carbs: 41,
                    allergenSlugs: [],
                    sizes: [{ label: 'Стандарт', weight: '150г', price: 5.90 }],
                },
                {
                    name: 'Чесночный',
                    description: 'Сливочно-чесночный соус',
                    image: 'images/garlic-sauce.jpg',
                    categorySlug: 'sauce',
                    sortOrder: 1,
                    calories: 180, proteins: 1.5, fats: 18, carbs: 3.5,
                    allergenSlugs: ['dairy', 'eggs'],
                    sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }],
                },
                {
                    name: 'Coca-Cola',
                    description: 'Классическая Coca-Cola',
                    image: 'images/coca-cola.jpg',
                    categorySlug: 'drinks',
                    sortOrder: 1,
                    calories: 42, proteins: 0, fats: 0, carbs: 10.6,
                    allergenSlugs: [],
                    sizes: [{ label: '0.5 л', weight: '500мл', price: 3.50 }],
                },
            ];

            const createdProducts = [];
            for (const p of products) {
                const product = await tx.product.create({
                    data: {
                        name: p.name,
                        description: p.description,
                        image: p.image,
                        badge: p.badge || null,
                        sortOrder: p.sortOrder,
                        calories: p.calories,
                        proteins: p.proteins,
                        fats: p.fats,
                        carbs: p.carbs,
                        allergenSlugs: p.allergenSlugs,
                        categoryId: catBySlug[p.categorySlug].id,
                        sizes: {
                            create: p.sizes,
                        },
                    },
                });
                createdProducts.push(product);
            }

            const modifiers = await Promise.all([
                tx.productModifier.create({ data: { name: 'Сырный бортик', price: 4.00, groupName: 'Бортик', maxQuantity: 1, kdsHighlight: true, kdsColor: '#FFD700' } }),
                tx.productModifier.create({ data: { name: 'Халапеньо', price: 1.50, groupName: 'Допы', maxQuantity: 1, kdsHighlight: true, kdsColor: '#FF4500' } }),
                tx.productModifier.create({ data: { name: 'Двойной сыр', price: 3.00, groupName: 'Допы', maxQuantity: 1, kdsHighlight: false } }),
                tx.productModifier.create({ data: { name: 'Без лука', price: 0.00, isRemoval: true, groupName: 'Убрать', maxQuantity: 1, kdsHighlight: true, kdsColor: '#FF0000' } }),
            ]);

            const pizzaIds = createdProducts
                .filter((product) => products.find((p) => p.name === product.name)?.categorySlug === 'pizza')
                .map((product) => product.id);

            for (const pizzaId of pizzaIds) {
                await tx.product.update({
                    where: { id: pizzaId },
                    data: {
                        modifiers: {
                            connect: modifiers.map((m) => ({ id: m.id })),
                        },
                    },
                });
            }

            await Promise.all([
                tx.promoCode.create({ data: { code: 'SLIVKI10', discount: 10, type: 'PERCENT', label: '−10% (Slivki.by)', usageLimit: 500, minOrderAmount: 15.00, validFrom: new Date('2024-01-01'), validTo: new Date('2026-12-31') } }),
                tx.promoCode.create({ data: { code: 'EXPRESS5', discount: 5, type: 'FIXED', label: '−5 руб.', usageLimit: 1000, minOrderAmount: 10.00 } }),
            ]);

            await tx.user.upsert({
                where: { phone: '+375445891111' },
                update: { name: 'Admin', role: 'ADMIN' },
                create: { phone: '+375445891111', name: 'Admin', role: 'ADMIN' },
            });

            await Promise.all([
                tx.aggregatorChannel.create({ data: { name: 'delivio', webhookSecret: 'change-me-delivio', isActive: false } }),
                tx.aggregatorChannel.create({ data: { name: 'wolt', webhookSecret: 'change-me-wolt', isActive: false } }),
                tx.kdsMetric.create({ data: { restaurantId: restaurant.id, categorySlug: 'pizza', avgPrepSeconds: 900, samplesCount: 10 } }),
                tx.kdsMetric.create({ data: { restaurantId: restaurant.id, categorySlug: 'sauce', avgPrepSeconds: 30, samplesCount: 10 } }),
                tx.kdsMetric.create({ data: { restaurantId: restaurant.id, categorySlug: 'drinks', avgPrepSeconds: 30, samplesCount: 10 } }),
            ]);
        });

        return res.json({ success: true, message: 'База успешно наполнена!' });
    } catch (err) {
        console.error('[Seed DB Trigger] Error:', err);
        return res.status(500).json({ success: false, error: 'Не удалось наполнить базу данных' });
    }
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
            telegram: process.env.TELEGRAM_BOT_TOKEN !== 'YOUR_BOT_TOKEN_HERE' ? 'configured' : 'stub',
            bepaid: process.env.BEPAID_SECRET_KEY !== 'YOUR_SECRET_KEY' ? 'configured' : 'stub',
            iiko: process.env.IIKO_API_LOGIN !== 'YOUR_IIKO_LOGIN' ? 'configured' : 'stub',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected', error: err.message });
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
