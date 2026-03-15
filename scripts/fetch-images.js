#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');

const menuDataPath = path.resolve(__dirname, '../server/prisma/menu-data.js');
const { products } = require(menuDataPath);

const outputDir = fs.existsSync(path.resolve(__dirname, '../client/public/images'))
    ? path.resolve(__dirname, '../client/public/images')
    : path.resolve(__dirname, '../images');

const webPrefix = '/images/';

function hasLocalImage(image) {
    return typeof image === 'string' && image.trim().startsWith('/images/');
}

function slugifyCyrillic(value) {
    const map = {
        а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
        к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
        х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
    };

    return String(value || '')
        .toLowerCase()
        .split('')
        .map((char) => map[char] ?? char)
        .join('')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .replace(/-{2,}/g, '-');
}

function collectTargets() {
    const seen = new Set();
    const targets = [];

    for (const product of products) {
        if (!hasLocalImage(product.image)) {
            const key = `product:${product.name}`;
            if (!seen.has(key)) {
                targets.push({ type: 'product', name: product.name });
                seen.add(key);
            }
        }

        for (const mod of product.modifiers || []) {
            if (!hasLocalImage(mod.image)) {
                const key = `modifier:${mod.name}`;
                if (!seen.has(key)) {
                    targets.push({ type: 'modifier', name: mod.name });
                    seen.add(key);
                }
            }
        }
    }

    return targets;
}

async function searchImageUrl(query) {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3&first=1&tsc=ImageBasicHover`;
    const response = await fetch(url, {
        headers: {
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        },
    });

    if (!response.ok) throw new Error(`Bing search failed (${response.status})`);

    const html = await response.text();
    const urls = [];
    const murlRegex = /"murl":"(.*?)"/g;
    let match;

    while ((match = murlRegex.exec(html)) !== null) {
        const decoded = match[1]
            .replace(/\\u002f/g, '/')
            .replace(/\\\//g, '/')
            .replace(/\\u003a/g, ':')
            .replace(/&amp;/g, '&');

        if (/^https?:\/\//i.test(decoded)) {
            urls.push(decoded);
        }

        if (urls.length >= 8) break;
    }

    if (!urls.length) {
        throw new Error('No image URLs found in Bing response');
    }

    return urls[0];
}

async function downloadImage(url, filepath) {
    const response = await fetch(url, {
        headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64)' },
    });
    if (!response.ok) throw new Error(`download failed (${response.status})`);

    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(filepath, Buffer.from(arrayBuffer));
}

function replaceInMenuData(entries) {
    let source = fs.readFileSync(menuDataPath, 'utf8');

    for (const entry of entries) {
        const escapedName = entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const imageLiteral = `'${entry.webPath}'`;

        if (entry.type === 'modifier') {
            const modifierPattern = new RegExp(`(\\{\\s*name:\\s*'${escapedName}'[^}]*?image:\\s*)'[^']*'`, 'g');
            source = source.replace(modifierPattern, `$1${imageLiteral}`);
        } else {
            const productImagePattern = new RegExp(`(\\{\\s*name:\\s*'${escapedName}'[^}]*?image:\\s*)'[^']*'`, 'g');
            if (productImagePattern.test(source)) {
                source = source.replace(productImagePattern, `$1${imageLiteral}`);
            } else {
                const productInsertPattern = new RegExp(`(\\{\\s*name:\\s*'${escapedName}'\\s*,\\s*categorySlug:\\s*'[^']+'\\s*,)`, 'g');
                source = source.replace(productInsertPattern, `$1 image: ${imageLiteral},`);
            }
        }
    }

    fs.writeFileSync(menuDataPath, source, 'utf8');
}

async function updateDatabase(entries) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return false;

    let PrismaClient;
    try {
        ({ PrismaClient } = require('../server/node_modules/@prisma/client'));
    } catch {
        return false;
    }

    const prisma = new PrismaClient();
    try {
        for (const entry of entries) {
            if (entry.type === 'modifier') {
                await prisma.productModifier.updateMany({
                    where: { name: entry.name },
                    data: { image: entry.webPath },
                });
            } else {
                await prisma.product.updateMany({
                    where: { name: entry.name },
                    data: { image: entry.webPath },
                });
            }
        }
        return true;
    } finally {
        await prisma.$disconnect();
    }
}

async function main() {
    fs.mkdirSync(outputDir, { recursive: true });

    const onlyNames = process.argv
        .filter((arg) => arg.startsWith('--only='))
        .flatMap((arg) => arg.replace('--only=', '').split(','))
        .map((name) => name.trim().toLowerCase())
        .filter(Boolean);

    const targets = collectTargets().filter((target) => {
        if (!onlyNames.length) return true;
        return onlyNames.includes(target.name.toLowerCase());
    });

    if (!targets.length) {
        console.log('ℹ️ Нет элементов без локальной картинки.');
        return;
    }

    const updates = [];

    for (const target of targets) {
        const query = `${target.name} доставка еда профессиональное фото изолированный фон`;
        const baseSlug = slugifyCyrillic(target.name) || `image-${Date.now()}`;
        const filename = `${target.type === 'modifier' ? 'mod' : 'product'}-${baseSlug}.jpg`;
        const filepath = path.join(outputDir, filename);
        const webPath = `${webPrefix}${filename}`;

        try {
            const imageUrl = await searchImageUrl(query);
            await downloadImage(imageUrl, filepath);
            updates.push({ ...target, webPath });
            console.log(`✅ Скачано фото для: ${target.name} -> ${webPath}`);
        } catch (error) {
            console.warn(`⚠️ Не удалось скачать фото для ${target.name}: ${error.message}`);
        }

        await delay(350);
    }

    if (updates.length) {
        replaceInMenuData(updates);
        const dbUpdated = await updateDatabase(updates);
        if (dbUpdated) {
            console.log('✅ База данных обновлена новыми путями изображений.');
        } else {
            console.log('ℹ️ DATABASE_URL отсутствует или Prisma недоступна — обновлен только menu-data.js.');
        }
    }
}

main().catch((error) => {
    console.error('❌ fetch-images failed:', error);
    process.exit(1);
});
