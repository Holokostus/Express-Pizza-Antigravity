const { randomUUID } = require('crypto');
const prisma = require('../lib/prisma');

let isImageFetchRunning = false;

class JobConflictError extends Error {
    constructor(message, statusCode = 409) {
        super(message);
        this.name = 'JobConflictError';
        this.statusCode = statusCode;
    }
}

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


function buildSearchQuery(item) {
    if (item.type === 'product') {
        const categoryName = item.category?.name || item.category?.slug || 'еда';
        return `${item.name} ${categoryName} аппетитная food photography studio light close-up`;
    }

    const modifierType = item.isRemoval ? 'ingredient icon' : 'pizza topping ingredient';
    return `${item.name} ${item.groupName || 'допы'} ${modifierType} isolated on white background`;
}


function buildForcedRefetchQuery(productName) {
    const normalizedName = String(productName || '').trim().toLowerCase();
    if (normalizedName.includes('трофей победителя')) {
        return 'комбо набор пицца и напитки фото +"на белом фоне изолированный" -watermark -checkerboard -stock';
    }

    return `${productName} +"на белом фоне изолированный" -watermark -checkerboard -stock`;
}

async function refetchBadProductImages() {
    const flaggedNames = ['Баварская', 'Хуторская', 'Трофей победителя'];
    const products = await prisma.product.findMany({
        where: {
            OR: [
                { name: { in: flaggedNames } },
                { image: { contains: 'watermark' } },
                { image: { contains: 'checkerboard' } },
                { image: { contains: 'stock' } },
                { image: { contains: 'shutterstock' } },
                { image: { contains: 'getty' } },
                { image: { contains: 'adobe' } },
            ],
        },
        select: { id: true, name: true },
    });

    for (const product of products) {
        const query = buildForcedRefetchQuery(product.name);
        try {
            const foundUrl = await findImageUrl(query);
            if (!/^https?:\/\//i.test(foundUrl)) {
                throw new Error('Found URL is not absolute');
            }

            await prisma.product.update({
                where: { id: product.id },
                data: { image: foundUrl },
            });
            console.log(`✅ Re-fetched bad image for product#${product.id} (${product.name})`);
        } catch (error) {
            console.warn(`⚠️ Re-fetch failed for product#${product.id} (${product.name}): ${error.message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 350));
    }
}



function buildCategoryRefetchQuery(product) {
    const slug = String(product?.category?.slug || '').toLowerCase();
    if (slug === 'juice' || slug === 'juices') {
        return `${product.name} +"упаковка сока изолированный фон"`;
    }
    if (slug === 'drinks' || slug === 'drink') {
        return `${product.name} +"бутылка газировки изолированный фон"`;
    }
    return `${product.name} +"закрытая пицца кальцоне на белом фоне"`;
}

async function refetchDrinksAndCalzones() {
    const products = await prisma.product.findMany({
        where: {
            category: {
                slug: { in: ['juice', 'juices', 'drinks', 'drink', 'togo', 'calzone'] },
            },
        },
        select: { id: true, name: true, category: { select: { slug: true } } },
    });

    for (const product of products) {
        const query = buildCategoryRefetchQuery(product);
        try {
            const foundUrl = await findImageUrl(query);
            if (!/^https?:\/\//i.test(foundUrl)) {
                throw new Error('Found URL is not absolute');
            }

            await prisma.product.update({
                where: { id: product.id },
                data: { image: foundUrl },
            });
            console.log(`✅ Re-fetched category image for product#${product.id} (${product.name})`);
        } catch (error) {
            console.warn(`⚠️ Category re-fetch failed for product#${product.id} (${product.name}): ${error.message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 350));
    }
}


async function refetchCriticalImages() {
    const criticalTargets = [
        { match: ['аппетитн'], query: 'пицца Аппетитная на белом фоне -суши -роллы' },
        { match: ['охотнич'], query: 'пицца мясная на белом фоне -курьер -велосипед -человек' },
        { match: ['ранчо'], query: 'пицца мясная на белом фоне -курьер -велосипед -человек' },
        { match: ['сырн'], query: 'пицца 4 сыра на белом фоне -тарелка -виноград' },
        { match: ['маринар'], query: 'пицца на белом фоне -watermark -logo -minaki.ru -stock' },
        { match: ['бавар'], query: 'пицца на белом фоне -watermark -logo -minaki.ru -stock' },
        { match: ['пикник'], query: 'комбо набор пицц -круассаны -вафли' },
        { match: ['чизбургер'], query: 'пицца чизбургер на белом фоне -checkerboard' },
        { match: ['кока-кола', 'кока кола', 'coca cola', 'coca-cola'], query: 'бутылка coca cola изолированный фон -checkerboard' },
    ];

    const products = await prisma.product.findMany({
        select: { id: true, name: true },
    });

    const targetRows = [];
    for (const product of products) {
        const normalizedName = String(product.name || '').trim().toLowerCase();
        const target = criticalTargets.find((entry) => entry.match.some((token) => normalizedName.includes(token)));
        if (target) {
            targetRows.push({ ...product, query: target.query });
        }
    }

    const seen = new Set();
    for (const product of targetRows) {
        if (seen.has(product.id)) continue;
        seen.add(product.id);

        try {
            const foundUrl = await findImageUrl(product.query);
            if (!/^https?:\/\//i.test(foundUrl)) {
                throw new Error('Found URL is not absolute');
            }

            await prisma.product.update({
                where: { id: product.id },
                data: { image: foundUrl },
            });
            console.log(`✅ Critical image refreshed for product#${product.id} (${product.name})`);
        } catch (error) {
            console.warn(`⚠️ Critical re-fetch failed for product#${product.id} (${product.name}): ${error.message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 350));
    }
}


function isImageFetchEndpointEnabled() {
    if (process.env.NODE_ENV !== 'production') {
        return true;
    }

    return process.env.ENABLE_IMAGE_FETCH_JOB === 'true';
}

async function runImageFetchJob() {
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
                select: { id: true, name: true, category: { select: { slug: true, name: true } } },
            }),
            prisma.productModifier.findMany({
                where: {
                    OR: [
                        { image: { equals: null } },
                        { image: { equals: '' } },
                        { image: { equals: '/images/icon.jpg' } },
                    ],
                },
                select: { id: true, name: true, groupName: true, isRemoval: true },
            }),
        ]);

        const queue = [
            ...products.map((item) => ({ ...item, type: 'product' })),
            ...modifiers.map((item) => ({ ...item, type: 'modifier' })),
        ];

        console.log(`🧾 Image fetch queue size: ${queue.length}`);

        for (const item of queue) {
            const query = buildSearchQuery(item);

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

async function triggerImageFetchJobByAdmin({ initiatorId, initiatorRole, ipAddress }) {
    if (!isImageFetchEndpointEnabled()) {
        const disabledError = new Error('Image fetch job endpoint is disabled by environment flag');
        disabledError.statusCode = 503;
        throw disabledError;
    }

    if (isImageFetchRunning) {
        throw new JobConflictError('Image fetch job is already running', 409);
    }

    await prisma.eventLog.create({
        data: {
            eventType: 'AdminImageFetchJobTriggered',
            aggregateType: 'SystemJob',
            aggregateId: 'image-fetch',
            payload: {
                jobName: 'fetch-images',
                triggeredBy: initiatorId,
                triggeredAt: new Date().toISOString(),
            },
            metadata: {
                source: 'admin_api',
                initiatorId,
                initiatorRole,
                ipAddress,
            },
            idempotencyKey: `admin_image_fetch_${initiatorId}_${Date.now()}_${randomUUID()}`,
        },
    });

    setImmediate(() => {
        runImageFetchJob().catch((error) => {
            console.error('❌ Background image fetch dispatcher failed:', error);
        });
    });
}

module.exports = {
    isImageFetchEndpointEnabled,
    triggerImageFetchJobByAdmin,
    refetchBadProductImages,
    refetchDrinksAndCalzones,
    refetchCriticalImages,
    JobConflictError,
};
