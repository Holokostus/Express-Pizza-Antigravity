#!/usr/bin/env node
const path = require('path');

let PrismaClient;
try {
  ({ PrismaClient } = require(path.resolve(__dirname, '../server/node_modules/@prisma/client')));
} catch (error) {
  console.error('❌ Prisma client not found. Run npm install inside /server first.');
  process.exit(1);
}

const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: 'pizza', name: 'Пицца', sortOrder: 1 },
  { slug: 'combo', name: 'Комбо и сеты', sortOrder: 2 },
  { slug: 'snacks', name: 'Закуски', sortOrder: 3 },
  { slug: 'drinks', name: 'Напитки', sortOrder: 4 },
  { slug: 'sauce', name: 'Соусы', sortOrder: 5 },
];

const PRODUCTS = [
  {
    name: 'Пепперони',
    description: 'Томатный соус, моцарелла, пепперони',
    image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=1000&q=80',
    categorySlug: 'pizza',
    sortOrder: 1,
    sizes: [
      { label: '30 см', weight: '540г', price: 18.9 },
      { label: '36 см', weight: '780г', price: 26.9 },
    ],
  },
  {
    name: '4 Сыра',
    description: 'Сливочный соус, моцарелла, дорблю, пармезан, чеддер',
    image: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=1000&q=80',
    categorySlug: 'pizza',
    sortOrder: 2,
    sizes: [
      { label: '30 см', weight: '560г', price: 21.9 },
      { label: '36 см', weight: '810г', price: 29.9 },
    ],
  },
  {
    name: 'BBQ Курица',
    description: 'Соус барбекю, курица, красный лук, моцарелла',
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1000&q=80',
    categorySlug: 'pizza',
    sortOrder: 3,
    sizes: [
      { label: '30 см', weight: '570г', price: 20.9 },
      { label: '36 см', weight: '820г', price: 28.9 },
    ],
  },
  {
    name: 'Сет “Два Хита”',
    description: 'Пепперони 30 см + Маргарита 30 см + 2 соуса',
    image: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=1000&q=80',
    categorySlug: 'combo',
    sortOrder: 1,
    sizes: [{ label: 'Набор', weight: '—', price: 34.9 }],
  },
  {
    name: 'Картофель фри',
    description: 'Хрустящий картофель с морской солью',
    image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=1000&q=80',
    categorySlug: 'snacks',
    sortOrder: 1,
    sizes: [
      { label: '150г', weight: '150г', price: 5.9 },
      { label: '250г', weight: '250г', price: 8.9 },
    ],
  },
  {
    name: 'Крылышки BBQ',
    description: 'Куриные крылышки в соусе BBQ',
    image: 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=1000&q=80',
    categorySlug: 'snacks',
    sortOrder: 2,
    sizes: [
      { label: '6 шт', weight: '300г', price: 9.9 },
      { label: '12 шт', weight: '600г', price: 17.9 },
    ],
  },
  {
    name: 'Coca‑Cola',
    description: 'Классическая Coca‑Cola',
    image: 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=1000&q=80',
    categorySlug: 'drinks',
    sortOrder: 1,
    sizes: [
      { label: '0.5 л', weight: '500мл', price: 3.5 },
      { label: '1 л', weight: '1000мл', price: 5.9 },
    ],
  },
  {
    name: 'Чесночный соус',
    description: 'Нежный сливочно-чесночный соус',
    image: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=1000&q=80',
    categorySlug: 'sauce',
    sortOrder: 1,
    sizes: [{ label: '40 мл', weight: '40г', price: 1.5 }],
  },
];

const PROMOTIONS = [
  {
    title: '2+1 на пиццы 30 см',
    subtitle: 'Добавьте 3 пиццы — самая дешёвая в подарок',
    badgeText: 'ТОП',
    bgColor: 'bg-gradient-to-r from-red-600 to-orange-500',
    imageUrl: 'https://images.unsplash.com/photo-1601924582975-7e6ec9f5f37d?w=1200&q=80',
    linkUrl: '/#menu',
    isActive: true,
  },
  {
    title: 'Комбо-обед',
    subtitle: 'Пицца 25 см + картофель + напиток',
    badgeText: 'ВЫГОДНО',
    bgColor: 'bg-gradient-to-r from-amber-500 to-red-500',
    imageUrl: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=80',
    linkUrl: '/#menu',
    isActive: true,
  },
];

async function main() {
  console.log('🌱 Seeding hardcoded menu (no web scraping)...');

  const categoryMap = new Map();

  await prisma.$transaction(async (tx) => {
    await tx.productSize.deleteMany();
    await tx.product.deleteMany();
    await tx.promotion.deleteMany();
    await tx.category.deleteMany();

    for (const category of CATEGORIES) {
      const created = await tx.category.create({ data: category });
      categoryMap.set(category.slug, created.id);
    }

    for (const product of PRODUCTS) {
      const createdProduct = await tx.product.create({
        data: {
          name: product.name,
          description: product.description,
          image: product.image,
          categoryId: categoryMap.get(product.categorySlug),
          sortOrder: product.sortOrder,
          isAvailable: true,
          allergenSlugs: [],
        },
      });

      for (const size of product.sizes) {
        await tx.productSize.create({
          data: {
            productId: createdProduct.id,
            label: size.label,
            weight: size.weight,
            price: size.price,
          },
        });
      }
    }

    for (const promotion of PROMOTIONS) {
      await tx.promotion.create({ data: promotion });
    }
  });

  console.log(`✅ Seeded ${CATEGORIES.length} categories, ${PRODUCTS.length} products, ${PROMOTIONS.length} promotions.`);
}

main()
  .catch((error) => {
    console.error('❌ Failed to seed hardcoded menu:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
