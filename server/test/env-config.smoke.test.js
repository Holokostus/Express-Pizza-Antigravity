const test = require('node:test');
const assert = require('node:assert/strict');

const {
    validateEnv,
    getMissingEnvVars,
    REQUIRED_AUTH_ENV_VARS,
    REQUIRED_PAYMENT_ENV_VARS,
} = require('../src/config/env');

test('env config: validates required auth and payment vars', () => {
    const validEnv = {
        JWT_SECRET: 'jwt-secret',
        BEPAID_SHOP_ID: 'shop-id',
        BEPAID_SECRET_KEY: 'secret-key',
        BEPAID_WEBHOOK_SECRET: 'webhook-secret',
    };

    assert.doesNotThrow(() => validateEnv(validEnv));
    assert.deepEqual(getMissingEnvVars(validEnv), []);
});

test('env config: fails when required auth/payment vars are missing', () => {
    const invalidEnv = {
        JWT_SECRET: '',
        BEPAID_SHOP_ID: 'shop-id',
        BEPAID_SECRET_KEY: '',
    };

    const missing = getMissingEnvVars(invalidEnv);

    assert.ok(missing.includes('JWT_SECRET'));
    assert.ok(missing.includes('BEPAID_SECRET_KEY'));
    assert.ok(missing.includes('BEPAID_WEBHOOK_SECRET'));

    assert.throws(() => validateEnv(invalidEnv), /Missing required environment variables/);
});

test('env config: required variable groups are present', () => {
    assert.deepEqual(REQUIRED_AUTH_ENV_VARS, ['JWT_SECRET']);
    assert.deepEqual(REQUIRED_PAYMENT_ENV_VARS, [
        'BEPAID_SHOP_ID',
        'BEPAID_SECRET_KEY',
        'BEPAID_WEBHOOK_SECRET',
    ]);
});
