#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const prisma = require('../server/src/lib/prisma');

const CATEGORY_ORDER = {
    pizza: { name: 'Пицца', sortOrder: 10 },
    togo: { name: 'Сеты & Акции', sortOrder: 20 },
    snacks: { name: 'Закуски', sortOrder: 30 },
    desserts: { name: 'Десерты', sortOrder: 40 },
    drinks: { name: 'Напитки', sortOrder: 50 },
    sauce: { name: 'Соусы', sortOrder: 60 },
    juice: { name: 'Соки', sortOrder: 70 },
};

const LEGACY_PROMOTIONS = [
    {
        title: 'Скидка 50% на вторую пиццу',
        subtitle: 'При заказе любой большой',
        badgeText: 'Акция',
        bgColor: 'bg-gradient-to-br from-red-600 via-red-500 to-orange-500',
        imageUrl: '/images/hero_banner.png',
        isActive: true,
    },
    {
        title: '4 пиццы по цене 3!',
        subtitle: 'Хватит на всю компанию',
        badgeText: 'Выгода 25%',
        bgColor: 'bg-gradient-to-br from-violet-600 via-purple-500 to-pink-500',
        imageUrl: '/images/hero_banner.png',
        isActive: true,
    },
    {
        title: 'Пицца в подарок!',
        subtitle: 'В ваш день рождения',
        badgeText: 'Именинникам',
        bgColor: 'bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600',
        imageUrl: '/images/hero_banner.png',
        isActive: true,
    },
    {
        title: 'Копи баллы, трать на пиццу',
        subtitle: '5% от каждого заказа',
        badgeText: 'ExpressCoins',
        bgColor: 'bg-gradient-to-br from-blue-600 via-sky-500 to-indigo-500',
        imageUrl: '/images/hero_banner.png',
        isActive: true,
    },
];

function loadLegacyMenu() {
    const dbPath = path.resolve(__dirname, '..', 'js', 'database.js');
    const source = fs.readFileSync(dbPath, 'utf8');
    const menuMatch = source.match(/const menu = \[(.|\n)*?\n\s*\];/);

    if (!menuMatch) {
        throw new Error('Не удалось найти const menu = [...] в js/database.js');
    }

    const expression = menuMatch[0].replace('const menu =', '').trim().replace(/;$/, '');
    return vm.runInNewContext(expression);
}

async function migrate() {
    const legacyMenu = loadLegacyMenu();

    await prisma.productSize.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.promotion.deleteMany();

    const slugs = [...new Set(legacyMenu.map((item) => item.category))];
    const categoriesToCreate = slugs.map((slug) => {
        const cfg = CATEGORY_ORDER[slug] || {
            name: slug,
            sortOrder: 1000,
        };

        return {
            slug,
            name: cfg.name,
            sortOrder: cfg.sortOrder,
        };
    }).sort((a, b) => a.sortOrder - b.sortOrder);

    const categoryMap = new Map();

    for (const category of categoriesToCreate) {
        const created = await prisma.category.create({ data: category });
        categoryMap.set(created.slug, created.id);
    }

    const categoryProductCounters = new Map();

    for (const item of legacyMenu) {
        const currentCount = categoryProductCounters.get(item.category) || 0;
        categoryProductCounters.set(item.category, currentCount + 1);

        await prisma.product.create({
            data: {
                name: item.name,
                description: item.description || '',
                image: item.image || '',
                badge: item.badge || undefined,
                isAvailable: item.isAvailable !== false,
                sortOrder: currentCount,
                categoryId: categoryMap.get(item.category),
                sizes: {
                    create: (item.sizes || []).map((size) => ({
                        label: size.label || 'Стандарт',
                        weight: size.weight || '',
                        price: Number(size.price) || 0,
                    })),
                },
            },
        });
    }

    await prisma.promotion.createMany({ data: LEGACY_PROMOTIONS });

    console.log(`✅ Migration done. Categories: ${categoriesToCreate.length}, products: ${legacyMenu.length}, promotions: ${LEGACY_PROMOTIONS.length}`);
}

migrate()
    .catch((error) => {
        console.error('❌ Migration failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
