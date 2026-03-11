// ============================================================
// ETA Engine — Dynamic Delivery Time Calculation
// ============================================================
// Formula: ETA = t_now + T_prep + T_route(traffic) + T_handoff
//
// T_prep:    from KdsMetric (rolling average per category)
// T_route:   from Yandex Routing API (real-time traffic)
// T_handoff: configurable buffer (default 3 min)
//
// Supports spillover to Yandex Delivery API during peak hours.
// ============================================================

const prisma = require('../lib/prisma');

const YANDEX_ROUTING_KEY = process.env.YANDEX_ROUTING_API_KEY || '';
const YANDEX_DELIVERY_KEY = process.env.YANDEX_DELIVERY_API_KEY || '';

// Default fallbacks (minutes)
const DEFAULT_PREP_MINUTES = 15;
const DEFAULT_ROUTE_MINUTES = 20;
const DEFAULT_HANDOFF_MINUTES = 3;

// Peak hours: if current active orders > threshold, enable spillover
const PEAK_ORDER_THRESHOLD = 15;

// ============================================================
// T_prep — from KDS Metrics
// ============================================================

async function calcPrepTime(items, restaurantId) {
    // Get the max prep time across all categories in the order
    const categorySlugs = new Set();
    for (const item of (items || [])) {
        if (item.product?.category?.slug) {
            categorySlugs.add(item.product.category.slug);
        } else if (item.categorySlug) {
            categorySlugs.add(item.categorySlug);
        }
    }

    if (categorySlugs.size === 0) return DEFAULT_PREP_MINUTES;

    const metrics = await prisma.kdsMetric.findMany({
        where: {
            restaurantId: restaurantId || 1,
            categorySlug: { in: Array.from(categorySlugs) },
        },
    });

    if (metrics.length === 0) return DEFAULT_PREP_MINUTES;

    // Use the LONGEST prep time (parallel cooking, bottleneck is slowest item)
    const maxSeconds = Math.max(...metrics.map(m => m.avgPrepSeconds));
    return Math.ceil(maxSeconds / 60);
}

// ============================================================
// T_route — from Yandex Routing API
// ============================================================

async function calcRouteTime(restaurantAddress, deliveryAddress) {
    if (!YANDEX_ROUTING_KEY || !deliveryAddress) {
        return DEFAULT_ROUTE_MINUTES;
    }

    try {
        // Geocode addresses → coordinates
        const fromCoords = await geocode(restaurantAddress);
        const toCoords = await geocode(deliveryAddress);

        if (!fromCoords || !toCoords) return DEFAULT_ROUTE_MINUTES;

        // Yandex Router API
        const url = `https://api.routing.yandex.net/v2/route?` +
            `waypoints=${fromCoords.lat},${fromCoords.lon}|${toCoords.lat},${toCoords.lon}` +
            `&apikey=${YANDEX_ROUTING_KEY}&mode=driving`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const durationSeconds = data?.route?.legs?.[0]?.duration?.value || 0;

        if (durationSeconds > 0) {
            const minutes = Math.ceil(durationSeconds / 60);
            console.log(`[ETA] Route: ${restaurantAddress} → ${deliveryAddress} = ${minutes} min`);
            return minutes;
        }

        return DEFAULT_ROUTE_MINUTES;
    } catch (err) {
        console.error('[ETA] Route calc error:', err.message);
        return DEFAULT_ROUTE_MINUTES;
    }
}

/**
 * Geocode address via Yandex Geocoder
 */
async function geocode(address) {
    if (!YANDEX_ROUTING_KEY) return null;

    try {
        const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${YANDEX_ROUTING_KEY}` +
            `&geocode=${encodeURIComponent(address)}&format=json&results=1`;

        const res = await fetch(url);
        const data = await res.json();
        const pos = data?.response?.GeoObjectCollection?.featureMember?.[0]
            ?.GeoObject?.Point?.pos;

        if (!pos) return null;
        const [lon, lat] = pos.split(' ').map(Number);
        return { lat, lon };
    } catch {
        return null;
    }
}

// ============================================================
// Main ETA Calculator
// ============================================================

/**
 * Calculate delivery ETA for an order
 *
 * @param {object} params
 * @param {object[]} params.items — order items with product.category.slug
 * @param {number} params.restaurantId
 * @param {string} params.restaurantAddress
 * @param {string} params.deliveryAddress
 * @returns {Promise<{etaPrepMinutes, etaRouteMinutes, etaHandoff, totalMinutes, estimatedAt}>}
 */
async function calculateETA({
    items = [],
    restaurantId = 1,
    restaurantAddress = '',
    deliveryAddress = '',
}) {
    // Calculate each component
    const [tPrep, tRoute] = await Promise.all([
        calcPrepTime(items, restaurantId),
        calcRouteTime(restaurantAddress, deliveryAddress),
    ]);

    const tHandoff = DEFAULT_HANDOFF_MINUTES;
    const totalMinutes = tPrep + tRoute + tHandoff;
    const estimatedAt = new Date(Date.now() + totalMinutes * 60 * 1000);

    console.log(`[ETA] T_prep=${tPrep}min + T_route=${tRoute}min + T_handoff=${tHandoff}min = ${totalMinutes}min`);

    return {
        etaPrepMinutes: tPrep,
        etaRouteMinutes: tRoute,
        etaHandoff: tHandoff,
        totalMinutes,
        estimatedAt,
    };
}

// ============================================================
// Peak Hour Detection + Yandex Delivery Spillover
// ============================================================

/**
 * Check if restaurant is in peak hour and should use Yandex Delivery
 */
async function checkSpillover(restaurantId) {
    const activeOrders = await prisma.order.count({
        where: {
            restaurantId,
            status: { in: ['NEW', 'CONFIRMED', 'COOKING', 'BAKING'] },
        },
    });

    const isPeak = activeOrders >= PEAK_ORDER_THRESHOLD;

    if (isPeak) {
        console.log(`[ETA] 🔥 Peak detected for restaurant #${restaurantId}: ${activeOrders} active orders`);
    }

    return { isPeak, activeOrders };
}

/**
 * Create Yandex Delivery order (spillover during peak)
 */
async function createYandexDelivery(order) {
    if (!YANDEX_DELIVERY_KEY) {
        console.log('[YandexDelivery] API key not configured — STUB');
        return { success: false, reason: 'not_configured' };
    }

    try {
        // Yandex Delivery API: POST /api/b2b/platform/offers/create
        const res = await fetch('https://b2b.taxi.yandex.net/b2b/cargo/v2/claims/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${YANDEX_DELIVERY_KEY}`,
                'Accept-Language': 'ru',
            },
            body: JSON.stringify({
                emergency_contact: { name: 'Express Pizza', phone: '+375445891111' },
                items: [{
                    title: `Заказ #${order.orderNumber}`,
                    quantity: 1,
                    size: { length: 0.4, width: 0.4, height: 0.15 },
                    weight: 2,
                    cost_value: String(Number(order.total) * 100),
                    cost_currency: 'BYN',
                }],
                route_points: [
                    {
                        type: 'source',
                        point_id: 1,
                        address: { fullname: order.restaurant?.address || 'г. Минск' },
                        contact: { name: 'Express Pizza', phone: '+375445891111' },
                    },
                    {
                        type: 'destination',
                        point_id: 2,
                        address: { fullname: order.customerAddress },
                        contact: { name: order.customerName, phone: order.customerPhone },
                    },
                ],
            }),
        });

        const result = await res.json();
        console.log(`[YandexDelivery] Claim created: ${result.id || 'unknown'}`);
        return { success: true, claimId: result.id };
    } catch (err) {
        console.error('[YandexDelivery] Error:', err.message);
        return { success: false, error: err.message };
    }
}

module.exports = {
    calculateETA,
    calcPrepTime,
    calcRouteTime,
    checkSpillover,
    createYandexDelivery,
};
