const test = require('node:test');
const assert = require('node:assert/strict');
const { OtpService } = require('../otpService');

function createInMemoryPrisma() {
    const state = new Map();

    const otpCode = {
        async findUnique({ where: { identifier } }) {
            const row = state.get(identifier);
            return row ? { ...row } : null;
        },
        async upsert({ where: { identifier }, create, update }) {
            const next = state.has(identifier) ? { ...state.get(identifier), ...update } : { ...create };
            state.set(identifier, { ...next });
            return { ...next };
        },
        async update({ where: { identifier }, data }) {
            if (!state.has(identifier)) {
                throw new Error('Record not found');
            }
            const next = { ...state.get(identifier), ...data };
            state.set(identifier, next);
            return { ...next };
        },
        async updateMany({ where, data }) {
            const row = state.get(where.identifier);
            if (!row) return { count: 0 };
            if (Object.prototype.hasOwnProperty.call(where, 'usedAt') && row.usedAt !== where.usedAt) {
                return { count: 0 };
            }
            state.set(where.identifier, { ...row, ...data });
            return { count: 1 };
        },
        async delete({ where: { identifier } }) {
            state.delete(identifier);
        },
    };

    return {
        otpCode,
        async $transaction(callback) {
            return callback({ otpCode });
        },
    };
}

test('otp integration flow: send -> verify ok -> replay fail -> expiry fail', async () => {
    const prisma = createInMemoryPrisma();
    const otpService = new OtpService({
        prisma,
        ttlSec: 1,
        resendIntervalMs: 0,
        maxAttempts: 3,
        lockDurationMs: 60_000,
    });

    const identifier = 'test@example.com';

    const sent = await otpService.issueOtp(identifier, '1234');
    assert.equal(sent.status, 'SENT');

    const ok = await otpService.verifyOtp(identifier, '1234');
    assert.equal(ok.status, 'VERIFIED');

    const replay = await otpService.verifyOtp(identifier, '1234');
    assert.equal(replay.status, 'REPLAY');

    await otpService.issueOtp(identifier, '7777');
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const expired = await otpService.verifyOtp(identifier, '7777');
    assert.equal(expired.status, 'NOT_FOUND');
});
