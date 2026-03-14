// ============================================================
// Express Pizza — Auth Router (Sprint 5)
// ============================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const { sendOtpEmail } = require('../services/emailService');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_jwt_secret_change_me';
const otpStore = new Map();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleSendOtp(req, res) {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();

        if (!email || !EMAIL_RE.test(email)) {
            return res.status(400).json({ error: 'Введите корректный email' });
        }

        const existing = otpStore.get(email);
        if (existing?.lastSentAt && Date.now() - existing.lastSentAt < 10000) {
            return res.status(429).json({ error: 'Подождите 10 секунд перед повторной отправкой' });
        }

        const code = Math.floor(1000 + Math.random() * 9000).toString();

        otpStore.set(email, {
            code,
            attempts: 0,
            expiresAt: Date.now() + 3 * 60 * 1000,
            lastSentAt: Date.now(),
        });

        try {
            await sendOtpEmail({ to: email, code });
        } catch (mailError) {
            console.error('[Auth] Send OTP email error:', mailError);
            if (process.env.NODE_ENV !== 'production') {
                return res.json({
                    success: true,
                    message: 'Письмо не отправлено (dev-режим). Используйте debugCode.',
                    debugCode: code,
                    isDevFallback: true,
                });
            }

            return res.status(502).json({ error: 'Не удалось отправить OTP. Попробуйте позже.' });
        }

        const payload = { success: true, message: 'OTP sent to email' };
        if (process.env.NODE_ENV !== 'production') {
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

        const otpData = otpStore.get(email);
        if (!otpData) {
            return res.status(400).json({ error: 'No OTP requested or code expired' });
        }

        if (Date.now() > otpData.expiresAt) {
            otpStore.delete(email);
            return res.status(400).json({ error: 'OTP code expired. Request a new one.' });
        }

        if (otpData.attempts >= 3) {
            otpStore.delete(email);
            return res.status(403).json({ error: 'Too many failed attempts. Try later.' });
        }

        const isValid = otpData.code === otp;

        if (!isValid) {
            otpData.attempts += 1;
            return res.status(400).json({ error: `Invalid code. ${3 - otpData.attempts} attempts remaining.` });
        }

        otpStore.delete(email);

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
