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
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = scriptRe.exec(html))) {
    const body = m[1].trim();
    if (!body) continue;

    if (body.startsWith('{') || body.startsWith('[')) {
      out.push(body);
    }

    const assignRe = /(?:window\.|self\.)?([A-Za-z0-9_$]+)\s*=\s*(\{[\s\S]*?\}|\[[\s\S]*?\]);/g;
    let am;
    while ((am = assignRe.exec(body))) {
      out.push(am[2]);
    }
  }
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

  const productRe = /<[^>]+class="[^"]*(?:product|menu)[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<[^>]+(?:class="[^"]*(?:title|name)[^"]*"|h\d)[^>]*>([^<]+)<[\s\S]*?(?:([\d]+[\.,]?\d*)\s*(?:BYN|руб))/gi;
  let pm;
  while ((pm = productRe.exec(html))) {
    products.push({
      image: absolutize(pm[1]),
      name: pm[2].trim(),
      price: toNumber(pm[3]),
      category: 'Пицца',
    });
  }

  const promoRe = /<[^>]+class="[^"]*promo[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
  let rm;
  while ((rm = promoRe.exec(html))) {
    const block = rm[1];
    const title = (block.match(/>([^<>]{5,})</) || [])[1];
    if (!title) continue;
    promotions.push({
      title: title.trim(),
      subtitle: '',
      badgeText: 'Акция',
      imageUrl: '',
      linkUrl: '',
    });
  }

  return { categories: [], products, promotions };
}

async function main() {
  console.log(`🌐 Fetching ${BASE_URL} ...`);
  const response = await fetch(BASE_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (ExpressPizzaBot/1.0)',
      'accept-language': 'ru-RU,ru;q=0.9,en;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`GET ${BASE_URL} failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  let parsed = parseFromJson(html);

  if (parsed.products.length === 0 && parsed.promotions.length === 0) {
    parsed = parseFromHtml(html);
  }

  const uniqueProducts = [];
  const seenProducts = new Set();
  for (const p of parsed.products) {
    if (!p.name || !Number.isFinite(p.price)) continue;
    const key = `${p.name}::${p.price}`;
    if (seenProducts.has(key)) continue;
    seenProducts.add(key);
    uniqueProducts.push(p);
  }

  const categoryNames = parsed.categories.length
    ? parsed.categories.map((c) => c.name)
    : [...new Set(uniqueProducts.map((p) => p.category || 'Пицца'))];

  const categories = categoryNames
    .filter(Boolean)
    .map((name, idx) => ({ name, slug: slugify(name) || `category-${idx + 1}`, sortOrder: idx + 1 }));

  const promotions = parsed.promotions
    .filter((p) => p.title)
    .slice(0, 20)
    .map((p) => ({
      title: p.title,
      subtitle: p.subtitle || '',
      badgeText: p.badgeText || 'Акция',
      bgColor: 'bg-gradient-to-r from-red-600 to-orange-500',
      imageUrl: p.imageUrl || 'https://placehold.co/800x400/ff6900/white?text=Express+Pizza',
      linkUrl: p.linkUrl || null,
      isActive: true,
    }));

  console.log(`📦 Parsed: categories=${categories.length}, products=${uniqueProducts.length}, promotions=${promotions.length}`);

  if (!categories.length || !uniqueProducts.length) {
    throw new Error('Scraper could not extract enough menu data from express-pizza.by');
  }

  const categoryMap = new Map();

  await prisma.$transaction(async (tx) => {
    await tx.productSize.deleteMany();
    await tx.product.deleteMany();
    await tx.promotion.deleteMany();
    await tx.category.deleteMany();

    for (const category of categories) {
      const created = await tx.category.create({ data: category });
      categoryMap.set(category.name, created.id);
    }

    for (const [idx, product] of uniqueProducts.entries()) {
      const categoryName = product.category && categoryMap.has(product.category)
        ? product.category
        : categories[0].name;

      const created = await tx.product.create({
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
          productId: created.id,
          label: 'Стандарт',
          weight: '—',
          price: product.price,
        },
      });
    }

    for (const promo of promotions) {
      await tx.promotion.create({ data: promo });
    }
  });

  console.log('✅ Database updated with scraped express-pizza.by data');
}

main()
  .catch((error) => {
    console.error('❌ Scrape failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
