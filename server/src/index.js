// ============================================================
// Express Pizza — Server Entry Point (Sprint 1: SaaS Platform)
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

const rateLimit = require('express-rate-limit');
const { requireAuth, checkRole } = require('./middleware/auth');

let isImageFetchRunning = false;

function decodeEscapedUrl(value) {
    return String(value || '')
        .replace(/\\u002f/g, '/')
        .replace(/\\\//g, '/')
        .replace(/\\u003a/g, ':')
        .replace(/&amp;/g, '&');
}

async function searchImageInBing(query) {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3&first=1&tsc=ImageBasicHover`;
    const response = await fetch(url, {
        headers: {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
    });

    if (!response.ok) {
        throw new Error(`Bing search failed (${response.status})`);
    }

    const html = await response.text();
    const murlRegex = /"murl":"(.*?)"/g;
    let match;

    while ((match = murlRegex.exec(html)) !== null) {
        const decoded = decodeEscapedUrl(match[1]);
        if (/^https?:\/\//i.test(decoded)) {
            return decoded;
        }
    }

    throw new Error('No image URLs found in Bing response');
}

async function searchImageInDuckDuckGo(query) {
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
    const searchPage = await fetch(searchUrl, {
        headers: {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
    });

    if (!searchPage.ok) {
        throw new Error(`DuckDuckGo search failed (${searchPage.status})`);
    }

    const html = await searchPage.text();
    const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
    if (!vqdMatch) {
        throw new Error('DuckDuckGo vqd token not found');
    }

    const imageApiUrl = `https://duckduckgo.com/i.js?l=ru-ru&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqdMatch[1])}&f=,,,&p=1`;
    const imageResponse = await fetch(imageApiUrl, {
        headers: {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64)',
            referer: 'https://duckduckgo.com/',
            'x-requested-with': 'XMLHttpRequest',
        },
    });

    if (!imageResponse.ok) {
        throw new Error(`DuckDuckGo image api failed (${imageResponse.status})`);
    }

    const payload = await imageResponse.json();
    const firstResult = payload?.results?.find((item) => /^https?:\/\//i.test(item?.image));
    if (!firstResult?.image) {
        throw new Error('No image URLs found in DuckDuckGo response');
    }

    return firstResult.image;
}

async function findImageUrl(query) {
    try {
        return await searchImageInBing(query);
    } catch (bingError) {
        console.warn(`⚠️ Bing failed for "${query}": ${bingError.message}`);
        return searchImageInDuckDuckGo(query);
    }
}

async function runImageFetchJob() {
    if (isImageFetchRunning) {
        console.log('ℹ️ fetch-images job already running, skipping duplicate start');
        return;
    }

    isImageFetchRunning = true;
    console.log('🚀 Background image fetch job started');

    try {
        const [products, modifiers] = await Promise.all([
            prisma.product.findMany({
                where: {
                    OR: [
                        { image: { equals: '' } },
                        { image: { equals: '/images/icon.jpg' } },
                    ],
                },
                select: { id: true, name: true },
            }),
            prisma.productModifier.findMany({
                where: {
                    OR: [
                        { image: { equals: null } },
                        { image: { equals: '' } },
                        { image: { equals: '/images/icon.jpg' } },
                    ],
                },
                select: { id: true, name: true },
            }),
        ]);

        const queue = [
            ...products.map((item) => ({ ...item, type: 'product' })),
            ...modifiers.map((item) => ({ ...item, type: 'modifier' })),
        ];

        console.log(`🧾 Image fetch queue size: ${queue.length}`);

        for (const item of queue) {
            const query = `${item.name} доставка еда профессиональное фото изолированный фон`;

            try {
                const foundUrl = await findImageUrl(query);
                if (!/^https?:\/\//i.test(foundUrl)) {
                    throw new Error('Found URL is not absolute');
                }

                if (item.type === 'product') {
                    await prisma.product.update({
                        where: { id: item.id },
                        data: { image: foundUrl },
                    });
                } else {
                    await prisma.productModifier.update({
                        where: { id: item.id },
                        data: { image: foundUrl },
                    });
                }

                console.log(`✅ Updated ${item.type}#${item.id} (${item.name})`);
            } catch (error) {
                console.warn(`⚠️ Failed ${item.type}#${item.id} (${item.name}): ${error.message}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 350));
        }
    } catch (error) {
        console.error('❌ Background image fetch job failed:', error);
    } finally {
        isImageFetchRunning = false;
        console.log('🏁 Background image fetch job finished');
    }
}

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

    setImmediate(() => {
        runImageFetchJob().catch((error) => {
            console.error('❌ Background image fetch dispatcher failed:', error);
        });
    });
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
app.post('/api/stock/out', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
    try {
        const { productId, restaurantId, reason } = req.body;
        await stockService.setOutOfStock(productId, restaurantId, reason);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stock/back', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
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
app.post('/api/print/service', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
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

app.post('/api/print/kitchen', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
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

app.post('/api/print/reprint/:receiptId', requireAuth, checkRole(['COOK', 'ADMIN']), async (req, res) => {
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
