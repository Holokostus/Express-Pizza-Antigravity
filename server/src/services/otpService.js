const OTP_TTL_SEC = 3 * 60;
const RESEND_INTERVAL_MS = 10 * 1000;
const MAX_ATTEMPTS = 3;
const LOCK_DURATION_MS = 3 * 60 * 1000;

function normalizeIdentifier(raw) {
    return String(raw || '').trim().toLowerCase();
}

function generateOtpCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

class OtpService {
    constructor(options = {}) {
        this._prisma = options.prisma || null;
        this.ttlSec = options.ttlSec || OTP_TTL_SEC;
        this.resendIntervalMs = options.resendIntervalMs || RESEND_INTERVAL_MS;
        this.maxAttempts = options.maxAttempts || MAX_ATTEMPTS;
        this.lockDurationMs = options.lockDurationMs || LOCK_DURATION_MS;
    }

    get prisma() {
        if (!this._prisma) {
            this._prisma = require('../lib/prisma');
        }

        return this._prisma;
    }

    async ensureReady() {
        return true;
    }

    async issueOtp(identifier, providedCode = generateOtpCode()) {
        const normalized = normalizeIdentifier(identifier);
        const now = new Date();
        const nowTs = now.getTime();

        return this.prisma.$transaction(async (tx) => {
            const existing = await tx.otpCode.findUnique({
                where: { identifier: normalized },
            });

            if (existing?.lockedUntil && existing.lockedUntil.getTime() > nowTs) {
                return { status: 'LOCKED', lockedUntil: existing.lockedUntil.getTime(), code: providedCode };
            }

            if (existing?.lastSentAt && nowTs - existing.lastSentAt.getTime() < this.resendIntervalMs) {
                return {
                    status: 'RATE_LIMIT',
                    retryAfterMs: this.resendIntervalMs - (nowTs - existing.lastSentAt.getTime()),
                    code: providedCode,
                };
            }

            await tx.otpCode.upsert({
                where: { identifier: normalized },
                create: {
                    identifier: normalized,
                    code: providedCode,
                    attempts: 0,
                    lastSentAt: now,
                    expiresAt: new Date(nowTs + this.ttlSec * 1000),
                    lockedUntil: null,
                    usedAt: null,
                },
                update: {
                    code: providedCode,
                    attempts: 0,
                    lastSentAt: now,
                    expiresAt: new Date(nowTs + this.ttlSec * 1000),
                    lockedUntil: null,
                    usedAt: null,
                },
            });

            return { status: 'SENT', expiresInSec: this.ttlSec, code: providedCode };
        });
    }

    async verifyOtp(identifier, otpCode) {
        const normalized = normalizeIdentifier(identifier);
        const providedCode = String(otpCode || '').trim();
        const now = new Date();
        const nowTs = now.getTime();

        return this.prisma.$transaction(async (tx) => {
            const record = await tx.otpCode.findUnique({ where: { identifier: normalized } });

            if (!record) {
                return { status: 'NOT_FOUND' };
            }

            if (record.expiresAt.getTime() <= nowTs) {
                await tx.otpCode.delete({ where: { identifier: normalized } });
                return { status: 'NOT_FOUND' };
            }

            if (record.lockedUntil && record.lockedUntil.getTime() > nowTs) {
                return { status: 'LOCKED', lockedUntil: record.lockedUntil.getTime() };
            }

            if (record.usedAt) {
                return { status: 'REPLAY' };
            }

            if (record.code === providedCode) {
                const updated = await tx.otpCode.updateMany({
                    where: { identifier: normalized, usedAt: null },
                    data: { usedAt: now },
                });

                if (!updated.count) {
                    return { status: 'REPLAY' };
                }

                return { status: 'VERIFIED' };
            }

            const attempts = record.attempts + 1;
            if (attempts >= this.maxAttempts) {
                const lockedUntil = new Date(nowTs + this.lockDurationMs);
                await tx.otpCode.update({
                    where: { identifier: normalized },
                    data: { attempts, lockedUntil },
                });
                return { status: 'LOCKED', attempts, lockedUntil: lockedUntil.getTime() };
            }

            await tx.otpCode.update({
                where: { identifier: normalized },
                data: { attempts },
            });
            return { status: 'INVALID', attempts, remainingAttempts: this.maxAttempts - attempts };
        });
    }

    async getDebugOtp(identifier) {
        const normalized = normalizeIdentifier(identifier);
        return this.prisma.otpCode.findUnique({ where: { identifier: normalized } });
    }
}

const otpService = new OtpService();

module.exports = {
    OtpService,
    otpService,
    normalizeIdentifier,
    generateOtpCode,
    OTP_TTL_SEC,
    RESEND_INTERVAL_MS,
    MAX_ATTEMPTS,
    LOCK_DURATION_MS,
};
