// ============================================================
// Express Pizza — Seed Script v2 (SaaS Platform)
// ============================================================
// Заполняет БД: рестораны, аллергены, категории, товары с КБЖУ,
// сложные модификаторы, промокоды, админ-пользователь,
// агрегаторные каналы, начальные KDS-метрики.
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding Express Pizza v2 database...\n');

    // ================================================================
    // 1. Restaurant
    // ================================================================
    const restaurant = await prisma.restaurant.upsert({
        where: { id: 1 },
        update: {},
        create: {
            name: 'Express Pizza — Партизанский',
            address: 'г. Минск, пр-т Партизанский, 19',
            phone: '+375445891111',
            posType: 'IIKO',
            posConfig: { apiLogin: '', orgId: '', terminalId: '' },
            printerIp: '192.168.1.100',
            printerPort: 9100,
        },
    });
    console.log(`✓ Restaurant: ${restaurant.name}`);

    // ================================================================
    // 2. Allergens (14 mandatory BY/EU)
    // ================================================================
    const allergens = [
        { slug: 'gluten', nameRu: 'Глютен', nameEn: 'Gluten', icon: '🌾' },
        { slug: 'crustaceans', nameRu: 'Ракообразные', nameEn: 'Crustaceans', icon: '🦐' },
        { slug: 'eggs', nameRu: 'Яйца', nameEn: 'Eggs', icon: '🥚' },
        { slug: 'fish', nameRu: 'Рыба', nameEn: 'Fish', icon: '🐟' },
        { slug: 'peanuts', nameRu: 'Арахис', nameEn: 'Peanuts', icon: '🥜' },
        { slug: 'soybeans', nameRu: 'Соя', nameEn: 'Soybeans', icon: '🫘' },
        { slug: 'dairy', nameRu: 'Молочные', nameEn: 'Dairy', icon: '🥛' },
        { slug: 'nuts', nameRu: 'Орехи', nameEn: 'Tree nuts', icon: '🌰' },
        { slug: 'celery', nameRu: 'Сельдерей', nameEn: 'Celery', icon: '🥬' },
        { slug: 'mustard', nameRu: 'Горчица', nameEn: 'Mustard', icon: '🟡' },
        { slug: 'sesame', nameRu: 'Кунжут', nameEn: 'Sesame', icon: '⚪' },
        { slug: 'sulphites', nameRu: 'Сульфиты', nameEn: 'Sulphites', icon: '🧪' },
        { slug: 'lupin', nameRu: 'Люпин', nameEn: 'Lupin', icon: '🌿' },
        { slug: 'molluscs', nameRu: 'Моллюски', nameEn: 'Molluscs', icon: '🐚' },
    ];

    for (const a of allergens) {
        await prisma.allergen.upsert({
            where: { slug: a.slug },
            update: { nameRu: a.nameRu, nameEn: a.nameEn, icon: a.icon },
            create: a,
        });
    }
    console.log(`✓ Allergens: ${allergens.length} seeded`);

    // ================================================================
    // 3. Categories
    // ================================================================
    const categories = [
        { slug: 'pizza', name: 'Пицца', sortOrder: 1 },
        { slug: 'togo', name: 'Пицца TOGO', sortOrder: 2 },
        { slug: 'sauce', name: 'Соусы', sortOrder: 3 },
        { slug: 'juice', name: 'Соки', sortOrder: 4 },
        { slug: 'drinks', name: 'Напитки', sortOrder: 5 },
    ];

    const catMap = {};
    for (const c of categories) {
        const cat = await prisma.category.upsert({
            where: { slug: c.slug },
            update: { name: c.name, sortOrder: c.sortOrder },
            create: c,
        });
        catMap[c.slug] = cat.id;
    }
    console.log(`✓ Categories: ${categories.length} seeded`);

    // ================================================================
    // 4. Products with КБЖУ and Allergens
    // ================================================================
    const products = [
        // ----- Пицца -----
        {
            name: 'Пепперони', description: 'Томатный соус, моцарелла, пепперони',
            image: 'images/pepperoni.jpg', categorySlug: 'pizza', sortOrder: 1,
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
            name: 'Маргарита', description: 'Томатный соус, моцарелла, базилик, помидоры',
            image: 'images/margherita.jpg', categorySlug: 'pizza', sortOrder: 2,
            badge: null,
            calories: 235, proteins: 9.8, fats: 9.5, carbs: 28.0,
            allergenSlugs: ['gluten', 'dairy'],
            sizes: [
                { label: '30 см', weight: '490г', price: 15.90 },
                { label: '36 см', weight: '720г', price: 22.90 },
                { label: '60 см', weight: '1400г', price: 39.90 },
            ],
        },
        {
            name: '4 Сыра', description: 'Сливочный соус, моцарелла, дор-блю, пармезан, чеддер',
            image: 'images/four-cheese.jpg', categorySlug: 'pizza', sortOrder: 3,
            badge: { text: 'Новинка', color: 'bg-green-500 text-white' },
            calories: 290, proteins: 14.2, fats: 15.8, carbs: 24.0,
            allergenSlugs: ['gluten', 'dairy', 'eggs'],
            sizes: [
                { label: '30 см', weight: '550г', price: 21.90 },
                { label: '36 см', weight: '800г', price: 29.90 },
                { label: '60 см', weight: '1600г', price: 49.90 },
            ],
        },
        {
            name: 'Гавайская', description: 'Томатный соус, моцарелла, курица, ананас',
            image: 'images/hawaiian.jpg', categorySlug: 'pizza', sortOrder: 4,
            badge: null,
            calories: 245, proteins: 12.0, fats: 8.5, carbs: 30.0,
            allergenSlugs: ['gluten', 'dairy'],
            sizes: [
                { label: '30 см', weight: '560г', price: 19.90 },
                { label: '36 см', weight: '790г', price: 27.90 },
                { label: '60 см', weight: '1550г', price: 46.90 },
            ],
        },
        {
            name: 'BBQ Курица', description: 'Соус BBQ, моцарелла, курица, лук, перец',
            image: 'images/bbq-chicken.jpg', categorySlug: 'pizza', sortOrder: 5,
            badge: { text: '🔥 Острая', color: 'bg-orange-500 text-white' },
            calories: 255, proteins: 13.0, fats: 10.5, carbs: 27.0,
            allergenSlugs: ['gluten', 'dairy', 'mustard'],
            sizes: [
                { label: '30 см', weight: '570г', price: 20.90 },
                { label: '36 см', weight: '810г', price: 28.90 },
                { label: '60 см', weight: '1600г', price: 48.90 },
            ],
        },
        {
            name: 'Мясная', description: 'Томатный соус, моцарелла, ветчина, бекон, фарш, пепперони',
            image: 'images/meat.jpg', categorySlug: 'pizza', sortOrder: 6,
            badge: null,
            calories: 285, proteins: 15.5, fats: 14.0, carbs: 25.0,
            allergenSlugs: ['gluten', 'dairy', 'mustard'],
            sizes: [
                { label: '30 см', weight: '600г', price: 22.90 },
                { label: '36 см', weight: '850г', price: 31.90 },
                { label: '60 см', weight: '1700г', price: 52.90 },
            ],
        },

        // ----- Пицца TOGO -----
        {
            name: 'Пепперони TOGO', description: 'Мини-пицца пепперони на вынос',
            image: 'images/pepperoni-togo.jpg', categorySlug: 'togo', sortOrder: 1,
            badge: { text: 'TOGO', color: 'bg-accent text-black' },
            calories: 265, proteins: 11.5, fats: 12.0, carbs: 27.0,
            allergenSlugs: ['gluten', 'dairy'],
            sizes: [{ label: '20 см', weight: '280г', price: 9.90 }],
        },
        {
            name: 'Маргарита TOGO', description: 'Мини-пицца маргарита на вынос',
            image: 'images/margherita-togo.jpg', categorySlug: 'togo', sortOrder: 2,
            badge: { text: 'TOGO', color: 'bg-accent text-black' },
            calories: 238, proteins: 9.8, fats: 9.5, carbs: 28.5,
            allergenSlugs: ['gluten', 'dairy'],
            sizes: [{ label: '20 см', weight: '260г', price: 7.90 }],
        },

        // ----- Соусы -----
        {
            name: 'Чесночный', description: 'Сливочно-чесночный соус',
            image: 'images/garlic-sauce.jpg', categorySlug: 'sauce', sortOrder: 1,
            calories: 180, proteins: 1.5, fats: 18.0, carbs: 3.5,
            allergenSlugs: ['dairy', 'eggs'],
            sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }],
        },
        {
            name: 'Томатный', description: 'Классический томатный соус',
            image: 'images/tomato-sauce.jpg', categorySlug: 'sauce', sortOrder: 2,
            calories: 45, proteins: 1.0, fats: 0.5, carbs: 9.0,
            allergenSlugs: [],
            sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }],
        },
        {
            name: 'Сырный', description: 'Сливочный сырный соус',
            image: 'images/cheese-sauce.jpg', categorySlug: 'sauce', sortOrder: 3,
            calories: 200, proteins: 4.0, fats: 18.5, carbs: 4.0,
            allergenSlugs: ['dairy'],
            sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }],
        },
        {
            name: 'BBQ', description: 'Соус барбекю',
            image: 'images/bbq-sauce.jpg', categorySlug: 'sauce', sortOrder: 4,
            calories: 120, proteins: 0.8, fats: 0.5, carbs: 28.0,
            allergenSlugs: ['mustard'],
            sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }],
        },

        // ----- Соки -----
        {
            name: 'Яблочный сок', description: 'Сок яблочный осветлённый',
            image: 'images/apple-juice.jpg', categorySlug: 'juice', sortOrder: 1,
            calories: 46, proteins: 0.1, fats: 0.1, carbs: 11.0,
            allergenSlugs: [],
            sizes: [
                { label: '0.2 л', weight: '200мл', price: 2.50 },
                { label: '1 л', weight: '1000мл', price: 4.90 },
            ],
        },
        {
            name: 'Апельсиновый сок', description: 'Сок апельсиновый',
            image: 'images/orange-juice.jpg', categorySlug: 'juice', sortOrder: 2,
            calories: 43, proteins: 0.5, fats: 0.1, carbs: 10.0,
            allergenSlugs: [],
            sizes: [
                { label: '0.2 л', weight: '200мл', price: 2.50 },
                { label: '1 л', weight: '1000мл', price: 4.90 },
            ],
        },

        // ----- Напитки -----
        {
            name: 'Coca-Cola', description: 'Классическая Coca-Cola',
            image: 'images/coca-cola.jpg', categorySlug: 'drinks', sortOrder: 1,
            calories: 42, proteins: 0, fats: 0, carbs: 10.6,
            allergenSlugs: [],
            sizes: [
                { label: '0.5 л', weight: '500мл', price: 3.50 },
                { label: '1 л', weight: '1000мл', price: 5.90 },
            ],
        },
        {
            name: 'Fanta', description: 'Апельсиновая Fanta',
            image: 'images/fanta.jpg', categorySlug: 'drinks', sortOrder: 2,
            calories: 39, proteins: 0, fats: 0, carbs: 9.8,
            allergenSlugs: [],
            sizes: [
                { label: '0.5 л', weight: '500мл', price: 3.50 },
                { label: '1 л', weight: '1000мл', price: 5.90 },
            ],
        },
        {
            name: 'Sprite', description: 'Лимонная свежесть',
            image: 'images/sprite.jpg', categorySlug: 'drinks', sortOrder: 3,
            calories: 36, proteins: 0, fats: 0, carbs: 9.0,
            allergenSlugs: [],
            sizes: [{ label: '0.5 л', weight: '500мл', price: 3.50 }],
        },
        {
            name: 'Вода', description: 'Минеральная вода негазированная',
            image: 'images/water.jpg', categorySlug: 'drinks', sortOrder: 4,
            calories: 0, proteins: 0, fats: 0, carbs: 0,
            allergenSlugs: [],
            sizes: [{ label: '0.5 л', weight: '500мл', price: 2.00 }],
        },
        {
            name: 'Bonaqua', description: 'Минеральная газированная',
            image: 'images/bonaqua.jpg', categorySlug: 'drinks', sortOrder: 5,
            calories: 0, proteins: 0, fats: 0, carbs: 0,
            allergenSlugs: [],
            sizes: [{ label: '0.5 л', weight: '500мл', price: 2.50 }],
        },
    ];

    const createdProducts = [];

    for (const p of products) {
        const product = await prisma.product.upsert({
            where: { id: createdProducts.length + 1 },
            update: {
                name: p.name,
                description: p.description,
                image: p.image,
                badge: p.badge,
                sortOrder: p.sortOrder,
                calories: p.calories,
                proteins: p.proteins,
                fats: p.fats,
                carbs: p.carbs,
                allergenSlugs: p.allergenSlugs,
                categoryId: catMap[p.categorySlug],
            },
            create: {
                name: p.name,
                description: p.description,
                image: p.image,
                badge: p.badge,
                sortOrder: p.sortOrder,
                calories: p.calories,
                proteins: p.proteins,
                fats: p.fats,
                carbs: p.carbs,
                allergenSlugs: p.allergenSlugs,
                categoryId: catMap[p.categorySlug],
                sizes: {
                    create: p.sizes.map(s => ({
                        label: s.label,
                        weight: s.weight,
                        price: s.price,
                    })),
                },
            },
        });
        createdProducts.push(product);
    }
    console.log(`✓ Products: ${createdProducts.length} seeded (with КБЖУ + Allergens)`);

    // ================================================================
    // 5. Complex Modifiers (grouped, with KDS highlighting)
    // ================================================================
    const modifiers = [
        {
            name: 'Сырный бортик', price: 4.00, isRemoval: false,
            groupName: 'Бортик', isMandatory: false, maxQuantity: 1,
            kdsHighlight: true, kdsColor: '#FFD700',
        },
        {
            name: 'Халапеньо', price: 1.50, isRemoval: false,
            groupName: 'Допы', isMandatory: false, maxQuantity: 1,
            kdsHighlight: true, kdsColor: '#FF4500',
        },
        {
            name: 'Двойной сыр', price: 3.00, isRemoval: false,
            groupName: 'Допы', isMandatory: false, maxQuantity: 1,
            kdsHighlight: false,
        },
        {
            name: 'Без лука', price: 0.00, isRemoval: true,
            groupName: 'Убрать', isMandatory: false, maxQuantity: 1,
            kdsHighlight: true, kdsColor: '#FF0000',
        },
        {
            name: 'Дополнительный соус', price: 1.50, isRemoval: false,
            groupName: 'Соусы', isMandatory: false, maxQuantity: 3,
            kdsHighlight: false,
        },
        {
            name: 'Двойной пепперони', price: 3.50, isRemoval: false,
            groupName: 'Допы', isMandatory: false, maxQuantity: 1,
            kdsHighlight: true, kdsColor: '#DC143C',
        },
    ];

    const createdModifiers = [];
    for (const m of modifiers) {
        const mod = await prisma.productModifier.upsert({
            where: { name: m.name },
            update: {
                price: m.price, isRemoval: m.isRemoval,
                groupName: m.groupName, isMandatory: m.isMandatory,
                maxQuantity: m.maxQuantity, kdsHighlight: m.kdsHighlight ?? false,
                kdsColor: m.kdsColor || '#FF6B00',
            },
            create: m,
        });
        createdModifiers.push(mod);
    }
    console.log(`✓ Modifiers: ${createdModifiers.length} seeded (grouped, KDS-tagged)`);

    // Link modifiers to pizza products
    const pizzaProducts = createdProducts.filter((_, idx) =>
        products[idx].categorySlug === 'pizza'
    );

    for (const pizza of pizzaProducts) {
        await prisma.product.update({
            where: { id: pizza.id },
            data: {
                modifiers: {
                    set: createdModifiers.map(m => ({ id: m.id })),
                },
            },
        });
    }
    console.log(`✓ Modifiers linked to ${pizzaProducts.length} pizza products`);

    // ================================================================
    // 6. Promo Codes (extended with validity + min amount)
    // ================================================================
    const promoCodes = [
        {
            code: 'SLIVKI10', discount: 10, type: 'PERCENT',
            label: '−10% (Slivki.by)', usageLimit: 500,
            minOrderAmount: 15.00,
            validFrom: new Date('2024-01-01'), validTo: new Date('2026-12-31'),
        },
        {
            code: 'SLIVKI20', discount: 20, type: 'PERCENT',
            label: '−20% (Slivki.by)', usageLimit: 200,
            minOrderAmount: 25.00,
            validFrom: new Date('2024-01-01'), validTo: new Date('2026-12-31'),
        },
        {
            code: 'EXPRESS5', discount: 5, type: 'FIXED',
            label: '−5 руб.', usageLimit: 1000,
            minOrderAmount: 10.00,
        },
        {
            code: 'FIRST30', discount: 30, type: 'PERCENT',
            label: '−30% на первый заказ', usageLimit: null,
            minOrderAmount: 20.00,
        },
    ];

    for (const p of promoCodes) {
        await prisma.promoCode.upsert({
            where: { code: p.code },
            update: {},
            create: {
                code: p.code,
                discount: p.discount,
                type: p.type,
                label: p.label,
                usageLimit: p.usageLimit || null,
                minOrderAmount: p.minOrderAmount || null,
                validFrom: p.validFrom || null,
                validTo: p.validTo || null,
            },
        });
    }
    console.log(`✓ Promo codes: ${promoCodes.length} seeded`);

    // ================================================================
    // 7. Admin User
    // ================================================================
    await prisma.user.upsert({
        where: { phone: '+375445891111' },
        update: {},
        create: {
            phone: '+375445891111',
            name: 'Admin',
            role: 'ADMIN',
        },
    });
    console.log('✓ Admin user seeded');

    // ================================================================
    // 8. Aggregator Channels
    // ================================================================
    const channels = [
        { name: 'delivio', webhookSecret: 'change-me-delivio', isActive: false },
        { name: 'wolt', webhookSecret: 'change-me-wolt', isActive: false },
    ];

    for (const ch of channels) {
        await prisma.aggregatorChannel.upsert({
            where: { name: ch.name },
            update: {},
            create: ch,
        });
    }
    console.log(`✓ Aggregator channels: ${channels.length} seeded`);

    // ================================================================
    // 9. Initial KDS Metrics (baseline prep times)
    // ================================================================
    const kdsMetrics = [
        { restaurantId: restaurant.id, categorySlug: 'pizza', avgPrepSeconds: 900 }, // 15 min
        { restaurantId: restaurant.id, categorySlug: 'togo', avgPrepSeconds: 480 }, // 8 min
        { restaurantId: restaurant.id, categorySlug: 'sauce', avgPrepSeconds: 30 }, // instant
        { restaurantId: restaurant.id, categorySlug: 'juice', avgPrepSeconds: 30 },
        { restaurantId: restaurant.id, categorySlug: 'drinks', avgPrepSeconds: 30 },
    ];

    for (const m of kdsMetrics) {
        await prisma.kdsMetric.upsert({
            where: {
                restaurantId_categorySlug: {
                    restaurantId: m.restaurantId,
                    categorySlug: m.categorySlug,
                },
            },
            update: { avgPrepSeconds: m.avgPrepSeconds },
            create: { ...m, samplesCount: 10 },
        });
    }
    console.log(`✓ KDS metrics: ${kdsMetrics.length} baselines seeded`);

    console.log('\n🎉 Seed completed successfully!\n');
}

main()
    .catch(e => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
