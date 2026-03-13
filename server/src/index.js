// ============================================================
// Express Pizza — Server Entry Point (Sprint 1: SaaS Platform)
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
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

const BASE_URL = 'https://express-pizza.by';

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-zа-я0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

function toNumber(value) {
    if (typeof value === 'number') return value;
    const normalized = String(value || '').replace(',', '.').replace(/[^\d.]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
}

function absolutize(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    return `${BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function extractJsonCandidates(html) {
    const out = [];
    const $ = cheerio.load(html);
    $('script').each((_, el) => {
        const body = $(el).html()?.trim();
        if (!body) return;

        if (body.startsWith('{') || body.startsWith('[')) {
            out.push(body);
        }

        const assignRe = /(?:window\.|self\.)?([A-Za-z0-9_$]+)\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\]);/g;
        let match;
        while ((match = assignRe.exec(body))) {
            out.push(match[2]);
        }
    });
    return out;
}

function parseFromJson(html) {
    const candidates = extractJsonCandidates(html);
    const categories = [];
    const products = [];
    const promotions = [];

    for (const raw of candidates) {
        try {
            const parsed = JSON.parse(raw);
            const queue = [parsed];
            while (queue.length) {
                const node = queue.shift();
                if (!node) continue;

                if (Array.isArray(node)) {
                    queue.push(...node);
                    continue;
                }

                if (typeof node !== 'object') continue;

                const name = node.name || node.title;
                const price = toNumber(node.price || node.cost);
                const image = node.image || node.imageUrl || node.picture;
                const maybeCategory = node.category || node.categoryName || node.section;

                if (name && price !== null && image) {
                    products.push({
                        name: String(name).trim(),
                        price,
                        image: absolutize(image),
                        category: String(maybeCategory || 'Пицца').trim(),
                    });
                }

                if ((node.slug || node.code) && (node.name || node.title) && !price) {
                    categories.push({
                        slug: slugify(node.slug || node.code || node.name || node.title),
                        name: String(node.name || node.title).trim(),
                    });
                }

                if ((node.link || node.url) && (node.title || node.name) && (node.subtitle || node.description || node.badgeText)) {
                    promotions.push({
                        title: String(node.title || node.name).trim(),
                        subtitle: String(node.subtitle || node.description || '').trim(),
                        badgeText: String(node.badgeText || 'Акция').trim(),
                        imageUrl: absolutize(node.image || node.imageUrl || ''),
                        linkUrl: absolutize(node.link || node.url || ''),
                    });
                }

                for (const value of Object.values(node)) {
                    if (value && typeof value === 'object') queue.push(value);
                }
            }
        } catch (error) {
            // ignore non-JSON scripts
        }
    }

    return { categories, products, promotions };
}

function parseFromHtml(html) {
    const products = [];
    const promotions = [];
    const $ = cheerio.load(html);

    $('[class*="product"], [class*="menu"]').each((_, el) => {
        const block = $(el);
        const name = block.find('[class*="title"], [class*="name"], h1, h2, h3, h4').first().text().trim();
        const image = block.find('img').first().attr('src');
        const priceMatch = block.text().match(/([\d]+[\.,]?\d*)\s*(?:BYN|руб)/i);

        if (!name || !image || !priceMatch) return;

        products.push({
            image: absolutize(image),
            name,
            price: toNumber(priceMatch[1]),
            category: 'Пицца',
        });
    });

    $('[class*="promo"]').each((_, el) => {
        const title = $(el).text().trim();
        if (!title || title.length < 5) return;
        promotions.push({
            title,
            subtitle: '',
            badgeText: 'Акция',
            imageUrl: '',
            linkUrl: '',
        });
    });

    return { categories: [], products, promotions };
}

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



app.get('/api/grant-admin', requireAuth, async (req, res) => {
    try {
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        const email = String(req.query?.email || '').trim().toLowerCase();
        if (!email) {
            return res.status(400).json({ error: 'Email обязателен' });
        }

        await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN' },
        });

        return res.json({ success: true, email });
    } catch (err) {
        return res.status(500).json({ error: 'Не удалось выдать права ADMIN' });
    }
});

app.get('/api/make-me-admin', requireAuth, async (req, res) => {
    try {
        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: { role: 'ADMIN' },
            select: { id: true, phone: true, role: true },
        });

        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: 'Не удалось выдать права ADMIN' });
    }
});

app.get('/api/force-migrate', async (req, res) => {
    try {
        const { runMigration } = require('../../scripts/migrate-legacy');
        await runMigration();
        res.json({ success: true, message: 'БД успешно заселена данными!' });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// ---- SEO: JSON-LD for rich snippets ----

app.get('/api/run-scraper', async (req, res) => {
    try {
        const response = await axios.get(BASE_URL, {
            headers: {
                'user-agent': 'Mozilla/5.0 (ExpressPizzaBot/1.0)',
                'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
            },
            timeout: 30000,
        });

        const html = response.data;
        let parsed = parseFromJson(html);

        if (parsed.products.length === 0 && parsed.promotions.length === 0) {
            parsed = parseFromHtml(html);
        }

        const uniqueProducts = [];
        const seenProducts = new Set();
        for (const product of parsed.products) {
            if (!product.name || !Number.isFinite(product.price)) continue;
            const key = `${product.name}::${product.price}`;
            if (seenProducts.has(key)) continue;
            seenProducts.add(key);
            uniqueProducts.push(product);
        }

        const categoryNames = parsed.categories.length
            ? parsed.categories.map((category) => category.name)
            : [...new Set(uniqueProducts.map((product) => product.category || 'Пицца'))];

        const categories = categoryNames
            .filter(Boolean)
            .map((name, idx) => ({
                name,
                slug: slugify(name) || `category-${idx + 1}`,
                sortOrder: idx + 1,
            }));

        const promotions = parsed.promotions
            .filter((promotion) => promotion.title)
            .slice(0, 20)
            .map((promotion) => ({
                title: promotion.title,
                subtitle: promotion.subtitle || '',
                badgeText: promotion.badgeText || 'Акция',
                bgColor: 'bg-gradient-to-r from-red-600 to-orange-500',
                imageUrl: promotion.imageUrl || 'https://placehold.co/800x400/ff6900/white?text=Express+Pizza',
                linkUrl: promotion.linkUrl || null,
                isActive: true,
            }));

        if (!categories.length || !uniqueProducts.length) {
            return res.status(500).json({ error: 'Не удалось получить достаточно данных меню с express-pizza.by' });
        }

        const categoryMap = new Map();

        await prisma.$transaction(async (tx) => {
            await tx.productSize.deleteMany();
            await tx.product.deleteMany();
            await tx.promotion.deleteMany();
            await tx.category.deleteMany();

            for (const category of categories) {
                const createdCategory = await tx.category.create({ data: category });
                categoryMap.set(category.name, createdCategory.id);
            }

            for (const [idx, product] of uniqueProducts.entries()) {
                const categoryName = product.category && categoryMap.has(product.category)
                    ? product.category
                    : categories[0].name;

                const createdProduct = await tx.product.create({
                    data: {
                        name: product.name,
                        description: '',
                        image: product.image || 'https://placehold.co/600x400/ff6900/white?text=Express+Pizza',
                        categoryId: categoryMap.get(categoryName),
                        sortOrder: idx + 1,
                        isAvailable: true,
                        allergenSlugs: [],
                    },
                });

                await tx.productSize.create({
                    data: {
                        productId: createdProduct.id,
                        label: 'Стандарт',
                        weight: '—',
                        price: product.price,
                    },
                });
            }

            for (const promotion of promotions) {
                await tx.promotion.create({ data: promotion });
            }
        });

        return res.json({ success: true, message: 'База наполнена реальными данными с сайта!' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

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
