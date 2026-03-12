// ============================================================
// Express Pizza — Server-Side Cart Pricing (Sprint 2)
// ============================================================

const prisma = require('../lib/prisma');

/**
 * Calculates authoritative cart totals based on DB prices.
 * The frontend payload is NEVER trusted for pricing.
 */
async function calculateCartTotal(items, promoCodeString = null) {
    let subtotal = 0;
    const validatedItems = [];

    // 1. Collect all IDs for batch fetching
    const productSizeIds = items.map(item => item.productSizeId);
    const modifierIds = items.flatMap(item => item.modifierIds || []);

    // 2. Batch fetch product sizes and modifiers
    const productSizes = await prisma.productSize.findMany({
        where: { id: { in: productSizeIds } },
        include: { product: true }
    });

    const modifiers = modifierIds.length > 0 
        ? await prisma.productModifier.findMany({ where: { id: { in: modifierIds } } })
        : [];

    // Create maps for O(1) lookups
    const productSizeMap = new Map(productSizes.map(ps => [ps.id, ps]));
    const modifierMap = new Map(modifiers.map(m => [m.id, m]));

    // 3. Calculate totals using memory maps
    for (const item of items) {
        const productSize = productSizeMap.get(item.productSizeId);

        if (!productSize || !productSize.product.isAvailable) {
            throw new Error(`Item ${item.productId} is unavailable or size invalid`);
        }

        let itemUnitPrice = Number(productSize.price);
        const validatedModifiers = [];

        // Check modifiers
        if (item.modifierIds && item.modifierIds.length > 0) {
            for (const modId of item.modifierIds) {
                const modifier = modifierMap.get(modId);
                if (!modifier) throw new Error(`Invalid modifier ID ${modId}`);

                // Add to unit price
                itemUnitPrice += Number(modifier.price);
                validatedModifiers.push({
                    modifierId: modifier.id,
                    priceAtOrder: Number(modifier.price)
                });
            }
        }

        // Add to subtotal
        subtotal += itemUnitPrice * item.quantity;

        // Build validated item for insertion
        validatedItems.push({
            productId: productSize.productId,
            productSizeId: productSize.id,
            quantity: item.quantity,
            unitPrice: itemUnitPrice,
            note: item.note || '',
            validatedModifiers
        });
    }

    // 3. Apply Promo Code (if any)
    let discount = 0;
    let validPromo = null;

    if (promoCodeString) {
        const promo = await prisma.promoCode.findUnique({ where: { code: promoCodeString } });

        if (promo && promo.isActive) {
            // Check expiry
            const now = new Date();
            if ((!promo.validFrom || promo.validFrom <= now) &&
                (!promo.validTo || promo.validTo >= now)) {

                // Check min order amount
                if (!promo.minOrderAmount || subtotal >= Number(promo.minOrderAmount)) {
                    // Check usage limit
                    if (!promo.usageLimit || promo.usageCount < promo.usageLimit) {

                        validPromo = promo;
                        if (promo.type === 'PERCENT') {
                            discount = subtotal * (Number(promo.discount) / 100);
                        } else if (promo.type === 'FIXED') {
                            discount = Number(promo.discount);
                        }
                    }
                }
            }
        }
    }

    // Never discount below 0
    discount = Math.min(discount, subtotal);
    const total = subtotal - discount;

    return {
        subtotal: parseFloat(subtotal.toFixed(2)),
        discount: parseFloat(discount.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        validatedItems,
        validPromo
    };
}

module.exports = { calculateCartTotal };
