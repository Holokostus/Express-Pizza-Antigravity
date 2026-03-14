// ============================================================
// Express Pizza — Seed Script v2 (SaaS Platform)
// ============================================================
// Заполняет БД: рестораны, аллергены, категории, товары с КБЖУ,
// сложные модификаторы, промокоды, админ-пользователь,
// агрегаторные каналы, начальные KDS-метрики.
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { categories: menuCategories, promotions: menuPromotions, products: menuProducts } = require('./menu-data');

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
    const categories = menuCategories;

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
    // 4. Products (menu import)
    // ================================================================
    const products = menuProducts.map((p, idx) => ({
        name: p.name,
        description: p.description || '',
        image: p.image || '',
        categorySlug: p.categorySlug,
        sortOrder: p.sortOrder ?? idx + 1,
        badge: p.badge || null,
        calories: p.calories ?? null,
        proteins: p.proteins ?? null,
        fats: p.fats ?? null,
        carbs: p.carbs ?? null,
        allergenSlugs: p.allergenSlugs || [],
        sizes: p.sizes || [{ label: 'Стандарт', weight: p.weight || '', price: p.price ?? 0 }],
    }));

    await prisma.orderItemModifier.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.productSize.deleteMany();
    await prisma.product.deleteMany();

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
    // 5. Promotions (marketing banners)
    // ================================================================
    await prisma.promotion.deleteMany();
    for (const promo of menuPromotions) {
        await prisma.promotion.create({ data: promo });
    }
    console.log(`✓ Promotions: ${menuPromotions.length} seeded`);

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
