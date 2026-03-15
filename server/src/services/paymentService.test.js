const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const originalSecret = process.env.BEPAID_WEBHOOK_SECRET;

function getFreshPaymentService() {
    delete require.cache[require.resolve('./paymentService')];
    return require('./paymentService');
}

test.afterEach(() => {
    if (originalSecret === undefined) {
        delete process.env.BEPAID_WEBHOOK_SECRET;
    } else {
        process.env.BEPAID_WEBHOOK_SECRET = originalSecret;
    }
    delete require.cache[require.resolve('./paymentService')];
});

test('verifyWebhookSignature returns true for a valid signature', () => {
    const payload = JSON.stringify({ transaction: { tracking_id: 'order-1' } });
    const secret = 'test-webhook-secret';
    process.env.BEPAID_WEBHOOK_SECRET = secret;

    const { verifyWebhookSignature } = getFreshPaymentService();
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    assert.equal(verifyWebhookSignature(payload, signature), true);
});

test('verifyWebhookSignature returns false for an invalid signature', () => {
    const payload = JSON.stringify({ transaction: { tracking_id: 'order-2' } });
    process.env.BEPAID_WEBHOOK_SECRET = 'test-webhook-secret';

    const { verifyWebhookSignature } = getFreshPaymentService();

    assert.equal(verifyWebhookSignature(payload, 'invalid-signature'), false);
});

test('verifyWebhookSignature returns false for an empty signature', () => {
    const payload = JSON.stringify({ transaction: { tracking_id: 'order-3' } });
    process.env.BEPAID_WEBHOOK_SECRET = 'test-webhook-secret';

    const { verifyWebhookSignature } = getFreshPaymentService();

    assert.equal(verifyWebhookSignature(payload, ''), false);
});

test('verifyWebhookSignature returns false when webhook secret is missing', () => {
    const payload = JSON.stringify({ transaction: { tracking_id: 'order-4' } });
    delete process.env.BEPAID_WEBHOOK_SECRET;

    const { verifyWebhookSignature } = getFreshPaymentService();
    const signature = crypto.createHmac('sha256', 'some-other-secret').update(payload).digest('hex');

    assert.equal(verifyWebhookSignature(payload, signature), false);
});
