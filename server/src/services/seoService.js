// ============================================================
// SEO Service — JSON-LD Schema.org Generator
// ============================================================
// Динамическая генерация structured data для Rich Snippets
// Google/Yandex: FoodEstablishment, Menu, MenuItem, Offer
// ============================================================

const prisma = require('../lib/prisma');

/**
 * Generate FoodEstablishment JSON-LD
 */
async function generateFoodEstablishment(restaurant) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FastFoodRestaurant',
        '@id': `https://expresspizza.by/#restaurant-${restaurant.id}`,
        name: restaurant.name,
        image: 'https://expresspizza.by/images/logo.png',
        address: {
            '@type': 'PostalAddress',
            streetAddress: restaurant.address,
            addressLocality: 'Минск',
            addressRegion: 'Минская область',
            postalCode: '220000',
            addressCountry: 'BY',
        },
        telephone: restaurant.phone,
        url: 'https://expresspizza.by',
        servesCuisine: ['Пицца', 'Итальянская', 'Фастфуд'],
        priceRange: '$$',
        openingHours: 'Mo-Su 10:00-23:00',
        paymentAccepted: 'Cash, Credit Card, Debit Card',
        currenciesAccepted: 'BYN',
        acceptsReservations: false,
        hasMenu: {
            '@type': 'Menu',
            '@id': 'https://expresspizza.by/#menu',
            name: 'Основное меню Express Pizza',
            hasMenuSection: [],
        },
    };
}

/**
 * Generate full Menu JSON-LD with MenuItem + Offer for each product
 */
async function generateMenuJsonLd() {
    const categories = await prisma.category.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
            products: {
                where: { isAvailable: true },
                orderBy: { sortOrder: 'asc' },
                include: {
                    sizes: { orderBy: { price: 'asc' } },
                },
            },
        },
    });

    const restaurant = await prisma.restaurant.findFirst({ where: { isActive: true } });

    const establishment = await generateFoodEstablishment(
        restaurant || { id: 1, name: 'Express Pizza', address: 'г. Минск', phone: '+375445891111' }
    );

    // Build MenuSections
    establishment.hasMenu.hasMenuSection = categories.map(cat => ({
        '@type': 'MenuSection',
        name: cat.name,
        hasMenuItem: cat.products.map(product => {
            const cheapest = product.sizes[0];
            const nutritionObj = product.calories ? {
                '@type': 'NutritionInformation',
                calories: `${product.calories} cal`,
                proteinContent: `${product.proteins}g`,
                fatContent: `${product.fats}g`,
                carbohydrateContent: `${product.carbs}g`,
            } : undefined;

            return {
                '@type': 'MenuItem',
                name: product?.name ?? 'Безымянный товар',
                description: product?.description || '',
                image: `https://expresspizza.by/${product.image}`,
                ...(nutritionObj ? { nutrition: nutritionObj } : {}),
                offers: product.sizes.map(size => ({
                    '@type': 'Offer',
                    name: size.label,
                    price: parseFloat(size.price).toFixed(2),
                    priceCurrency: 'BYN',
                    availability: 'https://schema.org/InStock',
                    eligibleQuantity: {
                        '@type': 'QuantitativeValue',
                        value: size.weight,
                    },
                })),
            };
        }),
    }));

    return establishment;
}

/**
 * Generate JSON-LD <script> tag for embedding in HTML
 */
async function generateJsonLdScript() {
    const data = await generateMenuJsonLd();
    return `<script type="application/ld+json">${JSON.stringify(data, null, 0)}</script>`;
}

module.exports = { generateMenuJsonLd, generateJsonLdScript, generateFoodEstablishment };
