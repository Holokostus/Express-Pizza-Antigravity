// ============================================================
// Express Pizza — bePaid Payment Service (Sprint 3)
// ============================================================

const crypto = require('crypto');
const fetch = require('node-fetch'); // Assuming node-fetch is available in Node 20 or using native fetch

// Using native fetch in Node 18+
const SHOP_ID = process.env.BEPAID_SHOP_ID || '361';
const SECRET_KEY = process.env.BEPAID_SECRET_KEY || 'b8647b68898b084b836474ed8d61ffe117c9a01168d867f24953b720d2ff81af';
const WEBHOOK_SECRET = process.env.BEPAID_WEBHOOK_SECRET || 'WEBHOOK_SECRET_PLACEHOLDER';

/**
 * Creates a bePaid checkout session URL
 * @param {string} externalOrderId UUID of the order
 * @param {number} amount Total amount in BYN
 * @param {object} customer Customer details (name, phone)
 * @returns {string} checkout_url
 */
async function createPaymentSession(externalOrderId, amount, customer = {}) {
    // ── STUB MODE: skip real bePaid if keys are not configured ──
    const isStub = !SHOP_ID || !SECRET_KEY
        || SHOP_ID === 'SHOP_ID_PLACEHOLDER' || SECRET_KEY === 'SECRET_KEY_PLACEHOLDER'
        || SHOP_ID === 'test' || SECRET_KEY === 'test';

    // REMOVED STUB CHECK TO FORCE TEST TRANSACTIONS THROUGH REAL BEPAID GATEWAY
    // if (isStub) {
    //     console.warn(`[bePaid STUB] Keys not configured — returning fake checkout URL for order ${externalOrderId}`);
    //     return `order-success.html?order=${externalOrderId}&stub=true`;
    // }

    // ── REAL MODE: call bePaid API ──
    const amountInCents = Math.round(amount * 100);

    const payload = {
        checkout: {
            test: process.env.NODE_ENV !== 'production',
            transaction_type: 'payment',
            order: {
                amount: amountInCents,
                currency: 'BYN',
                description: `Оплата заказа Express Pizza #${externalOrderId.substring(0, 8)}`,
                tracking_id: externalOrderId
            },
            settings: {
                success_url: `https://express-pizza-antigravity.vercel.app/order-success.html?order=${externalOrderId}`,
                decline_url: `https://express-pizza-antigravity.vercel.app/index.html?error=declined`,
                fail_url: `https://express-pizza-antigravity.vercel.app/index.html?error=failed`,
                cancel_url: `https://express-pizza-antigravity.vercel.app/index.html?error=cancelled`,
                language: 'ru',
                customer_fields: {
                    visible: ['first_name', 'phone'],
                    read_only: ['first_name', 'phone']
                }
            },
            customer: {
                first_name: customer.name || 'Клиент',
                phone: customer.phone || ''
            }
        }
    };

    const authHeader = 'Basic ' + Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');

    try {
        const response = await fetch('https://checkout.bepaid.by/ctp/api/checkouts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': authHeader
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`bePaid API Error: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        return data.checkout.redirect_url;
    } catch (error) {
        console.error('[bePaid] Error creating session:', error);
        throw error;
    }
}

/**
 * Verifies the HMAC-SHA256 signature from bePaid webhook
 */
function verifyWebhookSignature(payload, signature) {
    if (!signature) return false;

    // bePaid signature logic: HMAC-SHA256 of the raw JSON body
    // In Express, we need raw body for accurate verification, 
    // assuming payload is stringified JSON exactly as received
    const hash = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

    return hash === signature;
}

module.exports = {
    createPaymentSession,
    verifyWebhookSignature
};
