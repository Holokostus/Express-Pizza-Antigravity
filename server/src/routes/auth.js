// ============================================================
// Express Pizza — Auth Router (Sprint 5)
// ============================================================

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { sendOtpEmail } = require('../services/emailService');
const { signToken } = require('../utils/jwt');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 3 * 60 * 1000);
const OTP_RESEND_COOLDOWN_MS = Number(process.env.OTP_RESEND_COOLDOWN_MS || 10 * 1000);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 3);
const OTP_RATE_LIMIT_EMAIL_MAX = Number(process.env.OTP_RATE_LIMIT_EMAIL_MAX || 5);
const OTP_RATE_LIMIT_EMAIL_WINDOW_MS = Number(process.env.OTP_RATE_LIMIT_EMAIL_WINDOW_MS || 10 * 60 * 1000);
const OTP_RATE_LIMIT_IP_MAX = Number(process.env.OTP_RATE_LIMIT_IP_MAX || 20);
const OTP_RATE_LIMIT_IP_WINDOW_MS = Number(process.env.OTP_RATE_LIMIT_IP_WINDOW_MS || 10 * 60 * 1000);
const OTP_CLEANUP_INTERVAL_MS = Number(process.env.OTP_CLEANUP_INTERVAL_MS || 5 * 60 * 1000);

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }

    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function isLocalRequest(req) {
    const ip = getClientIp(req);
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
}

function canUseDebugOtp(req) {
    return process.env.OTP_ENABLE_DEBUG_CODE === 'true' && process.env.NODE_ENV !== 'production' && isLocalRequest(req);
}

async function consumeRateLimit(key, maxHits, windowMs) {
    const windowExpiresAt = new Date(Date.now() + windowMs);

    const [row] = await prisma.$queryRaw`
        INSERT INTO otp_rate_limits ("key", "hits", "windowExpiresAt", "createdAt", "updatedAt")
        VALUES (${key}, 1, ${windowExpiresAt}, NOW(), NOW())
        ON CONFLICT ("key")
        DO UPDATE
        SET
            "hits" = CASE
                WHEN otp_rate_limits."windowExpiresAt" <= NOW() THEN 1
                ELSE otp_rate_limits."hits" + 1
            END,
            "windowExpiresAt" = CASE
                WHEN otp_rate_limits."windowExpiresAt" <= NOW() THEN ${windowExpiresAt}
                ELSE otp_rate_limits."windowExpiresAt"
            END,
            "updatedAt" = NOW()
        RETURNING "hits", "windowExpiresAt";
    `;

    const hits = Number(row?.hits || 0);
    const retryAfterMs = row?.windowExpiresAt ? Math.max(new Date(row.windowExpiresAt).getTime() - Date.now(), 0) : 0;

    return {
        limited: hits > maxHits,
        hits,
        retryAfterMs,
    };
}

function startOtpCleanupTask() {
    const timer = setInterval(async () => {
        try {
            const now = new Date();
            await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: now } } });
            await prisma.otpRateLimit.deleteMany({ where: { windowExpiresAt: { lt: now } } });
        } catch (cleanupError) {
            console.error('[Auth] OTP cleanup task failed:', cleanupError?.message || cleanupError);
        }
    }, OTP_CLEANUP_INTERVAL_MS);

    timer.unref();
}

startOtpCleanupTask();

async function handleSendOtp(req, res) {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const ip = getClientIp(req);

        if (!email || !EMAIL_RE.test(email)) {
            return res.status(400).json({ error: 'Введите корректный email' });
        }

        const ipRateLimit = await consumeRateLimit(`ip:${ip}`, OTP_RATE_LIMIT_IP_MAX, OTP_RATE_LIMIT_IP_WINDOW_MS);
        if (ipRateLimit.limited) {
            return res.status(429).json({
                error: 'Слишком много попыток с этого IP. Попробуйте позже.',
                retryAfterMs: ipRateLimit.retryAfterMs,
            });
        }

        const emailRateLimit = await consumeRateLimit(`email:${email}`, OTP_RATE_LIMIT_EMAIL_MAX, OTP_RATE_LIMIT_EMAIL_WINDOW_MS);
        if (emailRateLimit.limited) {
            return res.status(429).json({
                error: 'Слишком много запросов OTP для этого email. Попробуйте позже.',
                retryAfterMs: emailRateLimit.retryAfterMs,
            });
        }

        const existing = await prisma.otpCode.findUnique({ where: { email } });
        if (existing?.lastSentAt && Date.now() - new Date(existing.lastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS) {
            return res.status(429).json({ error: 'Подождите 10 секунд перед повторной отправкой' });
        }

        const code = Math.floor(1000 + Math.random() * 9000).toString();

        await prisma.otpCode.upsert({
            where: { email },
            create: {
                email,
                code,
                attempts: 0,
                expiresAt: new Date(Date.now() + OTP_TTL_MS),
                lastSentAt: new Date(),
            },
            update: {
                code,
                attempts: 0,
                expiresAt: new Date(Date.now() + OTP_TTL_MS),
                lastSentAt: new Date(),
            },
        });

        try {
            await sendOtpEmail({ to: email, code });
        } catch (mailError) {
            console.error('[Auth] Send OTP email error:', mailError?.message || mailError);

            if (canUseDebugOtp(req)) {
                return res.json({
                    success: true,
                    message: 'SMTP недоступен. OTP доступен в debug-режиме для локальной среды.',
                    debugCode: code,
                    isDevFallback: true,
                });
            }

            return res.status(502).json({ error: 'Не удалось отправить OTP. Попробуйте позже.' });
        }

        const payload = { success: true, message: 'OTP sent to email' };
        if (canUseDebugOtp(req)) {
            payload.debugCode = code;
            payload.isDevFallback = false;
        }
        return res.json(payload);
    } catch (err) {
        console.error('[Auth] Send OTP email error:', err?.message || err);
        return res.status(500).json({ error: 'Не удалось сгенерировать OTP' });
    }
}

router.post('/send-email', handleSendOtp);
router.post('/send-sms', (req, res) => {
    req.body.email = req.body?.email || req.body?.phone;
    return handleSendOtp(req, res);
});

router.post('/grant-admin', requireAuth, async (req, res) => {
    try {
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Недостаточно прав' });
        }

        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email || !EMAIL_RE.test(email)) {
            return res.status(400).json({ error: 'Введите корректный email' });
        }

        await prisma.user.update({
            where: { email },
            data: { role: 'ADMIN' },
        });

        return res.json({ success: true, email });
    } catch (err) {
        console.error('[Auth] Grant admin error:', err);
        return res.status(500).json({ error: 'Не удалось выдать права ADMIN' });
    }
});

async function handleVerifyOtp(req, res) {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        const { code } = req.body;
        const otp = String(code || '').trim();

        if (!email || !code) {
            return res.status(400).json({ error: 'Email and code are required' });
        }

        const otpData = await prisma.otpCode.findUnique({ where: { email } });
        if (!otpData) {
            return res.status(400).json({ error: 'No OTP requested or code expired' });
        }

        if (Date.now() > new Date(otpData.expiresAt).getTime()) {
            await prisma.otpCode.delete({ where: { email } }).catch(() => null);
            return res.status(400).json({ error: 'OTP code expired. Request a new one.' });
        }

        if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
            await prisma.otpCode.delete({ where: { email } }).catch(() => null);
            return res.status(403).json({ error: 'Too many failed attempts. Try later.' });
        }

        const isValid = otpData.code === otp;

        if (!isValid) {
            const [attemptsUpdate] = await prisma.$queryRaw`
                UPDATE otp_codes
                SET "attempts" = "attempts" + 1,
                    "updatedAt" = NOW()
                WHERE "email" = ${email}
                  AND "attempts" < ${OTP_MAX_ATTEMPTS}
                RETURNING "attempts";
            `;

            const attemptsNow = Number(attemptsUpdate?.attempts || OTP_MAX_ATTEMPTS);
            const attemptsRemaining = Math.max(OTP_MAX_ATTEMPTS - attemptsNow, 0);

            if (attemptsRemaining === 0) {
                await prisma.otpCode.delete({ where: { email } }).catch(() => null);
                return res.status(403).json({ error: 'Too many failed attempts. Try later.' });
            }

            return res.status(400).json({ error: `Invalid code. ${attemptsRemaining} attempts remaining.` });
        }

        await prisma.otpCode.delete({ where: { email } }).catch(() => null);

        let user = await prisma.user.findUnique({
            where: { email },
            include: { pointsBalance: true },
        });

        if (!user) {
            const usersCount = await prisma.user.count();
            const initialRole = usersCount === 0 ? 'ADMIN' : 'CLIENT';

            user = await prisma.user.create({
                data: {
                    email,
                    phone: `email:${email}`,
                    role: initialRole,
                },
                include: { pointsBalance: true },
            });
        }

        const token = signToken({
            userId: user.id,
            email: user.email,
            phone: user.phone,
            role: user.role,
        });

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                phone: user.phone,
                email: user.email,
                name: user.name,
                role: user.role,
                loyaltyPoints: user.pointsBalance?.currentBalance || 0,
            },
        });
    } catch (err) {
        console.error('[Auth] Verify error:', err?.message || err);
        res.status(500).json({ error: 'Verification failed' });
    }
}

router.post('/verify', handleVerifyOtp);
router.post('/verify-otp', handleVerifyOtp);

router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            include: { pointsBalance: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
            id: user.id,
            phone: user.phone,
            name: user.name,
            email: user.email,
            address: user.address,
            loyaltyPoints: user.pointsBalance?.currentBalance || 0,
            allergies: user.allergies,
            role: user.role
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

module.exports = router;
