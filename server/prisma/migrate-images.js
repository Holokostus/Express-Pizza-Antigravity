// ============================================================
// Express Pizza — Image Migration Script
// ============================================================
// Updates all product images in the database to Unsplash URLs
// Run: node server/prisma/migrate-images.js
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const imageMap = {
    // ── Пиццы ──
    'Пепперони': 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=800&q=80',
    'Маргарита': 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=800&q=80',
    '4 Сыра': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=80',
    'Гавайская': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
    'BBQ Курица': 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=800&q=80',
    'Мясная': 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=800&q=80',

    // ── Пицца TOGO ──
    'Пепперони TOGO': 'https://images.unsplash.com/photo-1606502281004-f86cf1282af5?w=800&q=80',
    'Маргарита TOGO': 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=800&q=80',

    // ── Соусы ──
    'Чесночный': 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=800&q=80',
    'Томатный': 'https://images.unsplash.com/photo-1619684180510-830a0bcb88a0?w=800&q=80',
    'Сырный': 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=800&q=80',
    'BBQ': 'https://images.unsplash.com/photo-1625938145744-533e82e78778?w=800&q=80',

    // ── Соки ──
    'Яблочный сок': 'https://images.unsplash.com/photo-1576673442511-7e39b6545c87?w=800&q=80',
    'Апельсиновый сок': 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=800&q=80',

    // ── Напитки ──
    'Coca-Cola': 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=800&q=80',
    'Fanta': 'https://images.unsplash.com/photo-1624517452488-04869289c4ca?w=800&q=80',
    'Sprite': 'https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=800&q=80',
    'Вода': 'https://images.unsplash.com/photo-1560023907-5f339617ea55?w=800&q=80',
    'Bonaqua': 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=800&q=80',
};

async function main() {
    console.log('🖼️  Migrating product images to Unsplash URLs...\n');

    const products = await prisma.product.findMany();
    let updated = 0;

    for (const product of products) {
        const newUrl = imageMap[product.name];
        if (newUrl && product.image !== newUrl) {
            await prisma.product.update({
                where: { id: product.id },
                data: { image: newUrl },
            });
            console.log(`  ✓ ${product.name}: ${newUrl.substring(0, 60)}...`);
            updated++;
        }
    }

    console.log(`\n🎉 Done! Updated ${updated} of ${products.length} products.`);
}

main()
    .catch(e => { console.error('❌ Migration error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
