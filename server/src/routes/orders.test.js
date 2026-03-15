const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('./orders');

const {
    checkoutSchema,
    normalizeCheckoutEnums
} = __test;

const basePayload = {
    customerName: 'Ivan',
    customerPhone: '+375291112233',
    address: 'Minsk, Test st, 1',
    items: [{ productId: 1, quantity: 1 }]
};

test('checkout schema rejects invalid source enum', () => {
    const parsed = checkoutSchema.safeParse({
        ...basePayload,
        source: 'INVALID_SOURCE'
    });

    assert.equal(parsed.success, false);
    assert.ok(parsed.error.issues.some((issue) => issue.path.includes('source')));
});

test('checkout schema rejects invalid payment enums', () => {
    const parsed = checkoutSchema.safeParse({
        ...basePayload,
        payment: 'BTC',
        paymentMethod: 'APPLE_PAY'
    });

    assert.equal(parsed.success, false);
    assert.ok(parsed.error.issues.some((issue) => issue.path.includes('payment')));
    assert.ok(parsed.error.issues.some((issue) => issue.path.includes('paymentMethod')));
});

test('checkout schema rejects invalid paymentStatus enum', () => {
    const parsed = checkoutSchema.safeParse({
        ...basePayload,
        paymentStatus: 'DONE'
    });

    assert.equal(parsed.success, false);
    assert.ok(parsed.error.issues.some((issue) => issue.path.includes('paymentStatus')));
});

test('normalizeCheckoutEnums maps legacy aliases to enum values', () => {
    const normalized = normalizeCheckoutEnums({
        ...basePayload,
        source: 'web',
        payment: 'cash',
        paymentMethod: 'terminal',
        paymentStatus: 'paid'
    });

    assert.equal(normalized.source, 'WEBSITE');
    assert.equal(normalized.payment, 'CASH_IKASSA');
    assert.equal(normalized.paymentMethod, 'CASH_IKASSA');
    assert.equal(normalized.paymentStatus, 'PAID');
});

test('happy path: normalized payload passes checkout schema', () => {
    const normalized = normalizeCheckoutEnums({
        ...basePayload,
        source: 'website',
        payment: 'bepaid',
        paymentMethod: 'oplati',
        paymentStatus: 'success'
    });

    const parsed = checkoutSchema.safeParse(normalized);

    assert.equal(parsed.success, true);
    assert.equal(parsed.data.source, 'WEBSITE');
    assert.equal(parsed.data.payment, 'BEPAID_ONLINE');
    assert.equal(parsed.data.paymentMethod, 'OPLATI_QR');
    assert.equal(parsed.data.paymentStatus, 'PAID');
});
