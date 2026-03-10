// ============================================================
// Express Pizza — API Integration Layer (Stubs)
// ============================================================
// These are documented Promise-based wrappers for future backend
// integrations. Each function simulates success in MVP mode and
// includes JSDoc notes for production implementation.
// ============================================================

/**
 * Sync an order with the iikoCloud POS system.
 *
 * Production integration notes:
 * - Endpoint: POST https://api-ru.iiko.services/api/1/deliveries/create
 * - Auth: Bearer token from /api/1/access_token (API login key)
 * - Payload: map Express Pizza order items → iiko product IDs
 * - The organizationId and terminalGroupId must be configured
 * - Handle errors: item not in POS menu, terminal offline, etc.
 *
 * @param {Object} order - The order object from DatabaseService
 * @returns {Promise<{success: boolean, iikoOrderId?: string, error?: string}>}
 */
async function syncWithIiko(order) {
    console.log('[API Stub] syncWithIiko called for order #' + order.id);
    // Simulate network delay
    await new Promise(r => setTimeout(r, 200));
    // MVP: always succeed
    return {
        success: true,
        iikoOrderId: 'IIKO-' + order.id + '-' + Date.now(),
    };
}

/**
 * Process a payment via bePaid payment gateway.
 *
 * Production integration notes:
 * - bePaid Checkout widget: https://docs.bepaid.by/en/checkout/payment-token
 * - Step 1: POST /ctp/api/checkouts — create checkout with amount, currency (BYN), description
 * - Step 2: Redirect user to bePaid hosted page or use JS widget
 * - Step 3: Handle webhook callback at your server endpoint
 * - Auth: Base64(shop_id:secret_key) in Authorization header
 * - Test credentials available at docs.bepaid.by
 *
 * @param {number} amount - Amount in BYN (e.g., 42.90)
 * @param {string} cardToken - Tokenized card data from bePaid widget
 * @returns {Promise<{success: boolean, transactionId?: string, error?: string}>}
 */
async function processBePaidTransaction(amount, cardToken) {
    console.log(`[API Stub] processBePaidTransaction: ${amount} BYN`);
    await new Promise(r => setTimeout(r, 300));
    return {
        success: true,
        transactionId: 'BP-' + Date.now(),
    };
}

/**
 * Verify a Slivki.by promotional code via their Partner API.
 *
 * Production integration notes:
 * - Partner API docs: contact Slivki.by partnership team
 * - Endpoint (estimated): GET /api/v1/promo/validate?code=XXX&partner_id=YYY
 * - Response includes: discount_percent, valid_until, max_uses, current_uses
 * - Must verify server-side to prevent client-side tampering
 * - Cache valid codes for 5 minutes to reduce API calls
 *
 * @param {string} code - The promo code entered by user
 * @returns {Promise<{valid: boolean, discount?: number, type?: string, error?: string}>}
 */
async function verifySlivkiPromoCode(code) {
    console.log(`[API Stub] verifySlivkiPromoCode: "${code}"`);
    await new Promise(r => setTimeout(r, 400));
    // MVP: delegate to local validation in app.js
    return { valid: false, error: 'API not connected — using local validation' };
}

/**
 * Get delivery time estimate for a given address.
 *
 * Production integration notes:
 * - Use Yandex Maps Routing API or 2GIS API for Belarus
 * - Endpoint: https://api.routing.yandex.net/v2/route
 * - Inputs: origin (restaurant lat/lng), destination (customer address)
 * - Add preparation time (15 min avg) to travel time
 * - Consider traffic conditions from the response
 *
 * @param {string} address - Customer delivery address
 * @returns {Promise<{estimateMinutes: number, distanceKm: number}>}
 */
async function getDeliveryEstimate(address) {
    console.log(`[API Stub] getDeliveryEstimate: "${address}"`);
    await new Promise(r => setTimeout(r, 150));
    // MVP: return random realistic estimate
    return {
        estimateMinutes: Math.floor(Math.random() * 15) + 20,
        distanceKm: Math.round(Math.random() * 8 + 2),
    };
}
