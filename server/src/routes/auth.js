// ============================================================
// Express Pizza — Auth Router (Sprint 5)
// ============================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { sendOtpEmail } = require('../services/emailService');
const { otpService } = require('../services/otpService');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_jwt_secret_change_me';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9]{7,15}$/;

function shouldUseOtpFallback() {
    if (process.env.OTP_ALLOW_DEBUG_FALLBACK === 'true') return true;
    if (process.env.OTP_ALLOW_DEBUG_FALLBACK === 'false') return false;
    return process.env.NODE_ENV !== 'production' || !process.env.EMAIL_USER || !process.env.EMAIL_PASS;
}

function shouldExposeDebugCode(req) {
    if (process.env.NODE_ENV === 'production') {
        return false;
    }

    const queryDebug = String(req.query?.debug || '').toLowerCase() === 'true';
    const headerDebug = String(req.headers['x-debug-otp'] || '').toLowerCase() === 'true';
    const bodyDebug = req.body?.debug === true || String(req.body?.debug || '').toLowerCase() === 'true';

    return queryDebug || headerDebug || bodyDebug;
}

function resolveOtpTarget(req) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();

    if (email) {
        if (!EMAIL_RE.test(email)) {
            return { error: 'Введите корректный email' };
        }

        return { channel: 'email', id: email, email };
    }

    if (phone) {
        if (!PHONE_RE.test(phone)) {
            return { error: 'Введите корректный номер телефона' };
        }

        return { channel: 'sms', id: phone, phone };
    }

    return { error: 'Email или phone обязательны' };
}

async function handleSendOtp(req, res) {
    try {
        const target = resolveOtpTarget(req);
        if (target.error) {
            return res.status(400).json({ error: target.error });
        }

        await otpService.ensureReady();

        const issueResult = await otpService.issueOtp(target.id);

        if (issueResult.status === 'LOCKED') {
            return res.status(429).json({ error: 'Слишком много попыток. Попробуйте позже.' });
        }

        if (issueResult.status === 'RATE_LIMIT') {
            return res.status(429).json({ error: 'Подождите 10 секунд перед повторной отправкой' });
        }

        const code = issueResult.code;

        try {
            if (target.channel === 'email') {
                await sendOtpEmail({ to: target.email, code });
            }
        } catch (mailError) {
            console.error('[Auth] Send OTP email error:', mailError);
            if (shouldUseOtpFallback()) {
                const payload = {
                    success: true,
                    message: 'OTP отправлен в debug-режиме',
                    isDevFallback: true,
                };

                if (shouldExposeDebugCode(req)) {
                    payload.debugCode = code;
                }

                return res.json(payload);
            }

            return res.status(502).json({ error: 'Не удалось отправить OTP. Попробуйте позже.' });
        }

        const payload = { success: true, message: 'OTP sent' };
        if (shouldExposeDebugCode(req)) {
            payload.debugCode = code;
        }
        return res.json(payload);
    } catch (err) {
        console.error('[Auth] Send OTP email error:', err);
        return res.status(500).json({ error: 'Не удалось сгенерировать OTP' });
    }
}

router.post('/send-email', handleSendOtp);
router.post('/send-sms', (req, res) => {
    req.body.phone = req.body?.phone || req.body?.email;
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
        const target = resolveOtpTarget(req);
        const { code } = req.body;
        const otp = String(code || '').trim();

        if (target.error || !code) {
            return res.status(400).json({ error: 'Email/phone и code обязательны' });
        }

        await otpService.ensureReady();
        const verification = await otpService.verifyOtp(target.id, otp);

        if (verification.status === 'NOT_FOUND') {
            return res.status(400).json({ error: 'No OTP requested or code expired' });
        }

        if (verification.status === 'REPLAY') {
            return res.status(400).json({ error: 'OTP уже использован. Запросите новый код.' });
        }

        if (verification.status === 'LOCKED') {
            return res.status(403).json({ error: 'Too many failed attempts. Try later.' });
        }

        if (verification.status === 'INVALID') {
            return res.status(400).json({ error: `Invalid code. ${verification.remainingAttempts} attempts remaining.` });
        }

        const email = target.email || `phone:${target.phone}`;

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
                    phone: target.phone || `email:${email}`,
                    role: initialRole,
                },
                include: { pointsBalance: true },
            });
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, phone: user.phone, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

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
        console.error('[Auth] Verify error:', err);
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
