#!/usr/bin/env node

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

const LEGACY_MENU = [
    { id: 1, name: 'Пепперони', category: 'pizza', image: 'images/pepperoni.png', badge: { text: 'Хит', color: 'bg-primary text-white' }, description: 'Классическая пицца с пикантной колбасой пепперони и сыром моцарелла.', isAvailable: true, sizes: [{ label: '30 см', weight: '540г', price: 18.90 }, { label: '36 см', weight: '720г', price: 25.90 }, { label: '60 см', weight: '1400г', price: 42.90 }] },
    { id: 2, name: 'Маргарита', category: 'pizza', image: 'images/margherita.png', badge: { text: '-50%', color: 'bg-accent text-black' }, description: 'Традиционный вкус: томатный соус, свежая моцарелла и базилик.', isAvailable: true, sizes: [{ label: '30 см', weight: '510г', price: 16.50 }, { label: '36 см', weight: '680г', price: 23.50 }, { label: '60 см', weight: '1350г', price: 39.90 }] },
    { id: 3, name: 'Панская', category: 'pizza', image: 'images/pepperoni.png', badge: { text: 'Хит', color: 'bg-primary text-white' }, description: 'Фирменная пицца с ветчиной, грибами, луком и фирменным соусом.', isAvailable: true, sizes: [{ label: '30 см', weight: '560г', price: 19.90 }, { label: '36 см', weight: '750г', price: 27.90 }, { label: '60 см', weight: '1500г', price: 46.90 }] },
    { id: 4, name: 'Диаволо (острая)', category: 'pizza', image: 'images/margherita.png', badge: { text: '🔥 Острое', color: 'bg-orange-500 text-white' }, description: 'Жгучая пицца с салями, перцем чили, халапеньо и острым соусом.', isAvailable: true, sizes: [{ label: '30 см', weight: '530г', price: 20.50 }, { label: '36 см', weight: '710г', price: 28.50 }, { label: '60 см', weight: '1420г', price: 48.90 }] },
    { id: 5, name: 'Бургер пицца', category: 'pizza', image: 'images/pepperoni.png', badge: null, description: 'Сочная говядина, маринованные огурцы, красный лук и соус бургер.', isAvailable: true, sizes: [{ label: '30 см', weight: '580г', price: 21.90 }, { label: '36 см', weight: '780г', price: 29.90 }, { label: '60 см', weight: '1550г', price: 49.90 }] },
    { id: 6, name: 'Четыре сыра', category: 'pizza', image: 'images/margherita.png', badge: null, description: 'Моцарелла, дор-блю, пармезан и чеддер — рай для сырных гурманов.', isAvailable: true, sizes: [{ label: '30 см', weight: '520г', price: 22.50 }, { label: '36 см', weight: '700г', price: 30.50 }, { label: '60 см', weight: '1380г', price: 52.90 }] },
    { id: 7, name: 'Гавайская', category: 'pizza', image: 'images/pepperoni.png', badge: null, description: 'Ветчина, ананасы и моцарелла — сладко-солёная классика.', isAvailable: true, sizes: [{ label: '30 см', weight: '550г', price: 19.50 }, { label: '36 см', weight: '730г', price: 26.90 }, { label: '60 см', weight: '1450г', price: 44.90 }] },
    { id: 10, name: 'Сет «Для своих»', category: 'pizza', image: 'images/margherita.png', badge: { text: 'Сет', color: 'bg-violet-600 text-white' }, description: '7 пицц 30 см на большую компанию! Пепперони, Маргарита, Панская, Диаволо, Бургер, Ветчина, Сырная.', isAvailable: true, sizes: [{ label: '7 пицц', weight: '4200г', price: 99.90 }] },
    { id: 20, name: 'TOGO Ветчина', category: 'togo', image: 'images/pepperoni.png', badge: null, description: 'Удобный формат с собой: ветчина, сыр и фирменный соус.', isAvailable: true, sizes: [{ label: '22 см', weight: '350г', price: 12.00 }] },
    { id: 21, name: 'TOGO Пепперони', category: 'togo', image: 'images/margherita.png', badge: null, description: 'Маленькая пицца с пепперони — идеально для перекуса.', isAvailable: true, sizes: [{ label: '22 см', weight: '340г', price: 11.50 }] },
    { id: 22, name: 'TOGO Маргарита', category: 'togo', image: 'images/pepperoni.png', badge: null, description: 'Классическая маргарита в удобном формате.', isAvailable: true, sizes: [{ label: '22 см', weight: '330г', price: 10.90 }] },
    { id: 30, name: 'Соус Чесночный', category: 'sauce', image: 'https://images.unsplash.com/photo-1574071318508-1cdbad80ad38?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Классический чесночный соус для корочек.', isAvailable: true, sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }] },
    { id: 31, name: 'Соус Барбекю', category: 'sauce', image: 'https://images.unsplash.com/photo-1574071318508-1cdbad80ad38?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Копчёный и сладковатый — идеален к бортикам.', isAvailable: true, sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }] },
    { id: 32, name: 'Соус Сырный', category: 'sauce', image: 'https://images.unsplash.com/photo-1574071318508-1cdbad80ad38?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Нежный сырный соус для пиццы и снэков.', isAvailable: true, sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }] },
    { id: 40, name: 'Rich Яблочный', category: 'juice', image: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Натуральный яблочный сок Rich.', isAvailable: true, sizes: [{ label: '1 л', weight: '1л', price: 3.50 }] },
    { id: 41, name: 'Rich Апельсиновый', category: 'juice', image: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Сочный апельсиновый сок Rich с мякотью.', isAvailable: true, sizes: [{ label: '1 л', weight: '1л', price: 3.90 }] },
    { id: 42, name: 'Rich Мультифрукт', category: 'juice', image: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Мультифруктовый нектар Rich.', isAvailable: true, sizes: [{ label: '1 л', weight: '1л', price: 3.90 }] },
    { id: 50, name: 'Coca-Cola', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Классический газированный напиток.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 2.80 }, { label: '1 л', weight: '1л', price: 4.50 }] },
    { id: 51, name: 'Fanta', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Газированный напиток со вкусом апельсина.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 2.80 }, { label: '1 л', weight: '1л', price: 4.50 }] },
    { id: 52, name: 'Sprite', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Освежающий лимонно-лаймовый напиток.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 2.80 }, { label: '1 л', weight: '1л', price: 4.50 }] },
    { id: 53, name: 'Вода Bonaqua', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Чистая питьевая вода без газа.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 1.90 }] },
];


const REAL_MODIFIERS = [
    {
        name: 'Сырный бортик',
        price: 4.5,
        category: 'Бортики',
        imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80',
    },
    {
        name: 'Халапеньо',
        price: 2.2,
        category: 'Острота',
        imageUrl: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=400&q=80',
    },
    {
        name: 'Пармезан',
        price: 3.1,
        category: 'Сыры',
        imageUrl: 'https://images.unsplash.com/photo-1452195100486-9cc805987862?auto=format&fit=crop&w=400&q=80',
    },
    {
        name: 'Бекон',
        price: 3.9,
        category: 'Мясо',
        imageUrl: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=400&q=80',
    },
];

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

async function runMigration() {
    const legacyMenu = LEGACY_MENU;

    await prisma.productSize.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.promotion.deleteMany();
    await prisma.modifier.deleteMany();

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

    const modifierRecords = [];
    for (const mod of REAL_MODIFIERS) {
        const createdModifier = await prisma.modifier.create({
            data: {
                name: mod.name,
                category: mod.category,
                imageUrl: mod.imageUrl,
                price: Number(mod.price) || 0,
            },
        });
        modifierRecords.push(createdModifier);
    }

    for (const item of legacyMenu) {
        const currentCount = categoryProductCounters.get(item.category) || 0;
        categoryProductCounters.set(item.category, currentCount + 1);
        const isPizza = item.category === 'pizza';

        await prisma.product.create({
            data: {
                name: item.name,
                description: item.description || '',
                image: item.image || '',
                badge: item.badge || undefined,
                isAvailable: item.isAvailable !== false,
                sortOrder: currentCount,
                categoryId: categoryMap.get(item.category),
                dodoModifiers: isPizza ? { connect: modifierRecords.map((mod) => ({ id: mod.id })) } : undefined,
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

    console.log(`✅ Migration done. Categories: ${categoriesToCreate.length}, products: ${legacyMenu.length}, promotions: ${LEGACY_PROMOTIONS.length}, modifiers: ${modifierRecords.length}`);
}

module.exports = {
    runMigration,
};

if (require.main === module) {
    runMigration()
        .catch((error) => {
            console.error('❌ Migration failed:', error);
            process.exitCode = 1;
        })
        .finally(async () => {
            await prisma.$disconnect();
        });
}
