// ============================================================
// Express Pizza — Auth Router (Sprint 5)
// ============================================================

const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { JWT_SECRET, requireAuth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// In-memory OTP store (In production, use Redis with TTL)
// Maps phone number -> { code: "1234", attempts: 0, expiresAt: timestamp }
const otpStore = new Map();

/**
 * POST /api/auth/send-sms
 * Generates a 4-digit OTP and "sends" it via SMS.by (stubbed here)
 */
router.post('/send-sms', async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone || !/^\+375(29|33|44|25)\d{7}$/.test(phone)) {
            return res.status(400).json({ error: 'Invalid Belarusian phone number format' });
        }

        // Rate limiting check
        const existing = otpStore.get(phone);
        if (existing && existing.expiresAt > Date.now() + 50000) { // Sent within last 10 seconds
            return res.status(429).json({ error: 'Please wait before requesting another code' });
        }

        // Generate 4-digit code (always 1111 in dev for easy testing)
        const code = process.env.NODE_ENV === 'production'
            ? Math.floor(1000 + Math.random() * 9000).toString()
            : '1111';

        // Store with 3 minute TTL
        otpStore.set(phone, {
            code,
            attempts: 0,
            expiresAt: Date.now() + 3 * 60 * 1000 // 3 minutes
        });

        // STUB: Here we would call SMS.by API (smsService.js)
        console.log(`[SMS.by Stub] Sending OTP ${code} to ${phone}`);

        res.json({ success: true, message: 'SMS sent' });

    } catch (err) {
        console.error('[Auth] Send SMS error:', err);
        res.status(500).json({ error: 'Failed to send SMS' });
    }
});

/**
 * POST /api/auth/verify
 * Validates the OTP. If valid, issues a JWT token.
 * If user does not exist, creates a new CUSTOMER record.
 */
router.post('/verify', async (req, res) => {
    try {
        const { phone, code } = req.body;

        if (!phone || !code) {
            return res.status(400).json({ error: 'Phone and code are required' });
        }

        // ⚡ INSTANT ADMIN ACCESS — no OTP needed for this magic number
        if (phone === '+375999999999') {
            let user = await prisma.user.findUnique({ where: { phone } });
            if (!user) {
                user = await prisma.user.create({ data: { phone, role: 'ADMIN', name: 'Superadmin' } });
            } else if (user.role !== 'ADMIN') {
                user = await prisma.user.update({ where: { phone }, data: { role: 'ADMIN' } });
            }
            const token = jwt.sign(
                { userId: user.id, phone: user.phone, role: 'ADMIN' },
                JWT_SECRET, { expiresIn: '7d' }
            );
            console.log(`[Auth] ⚡ Instant admin login: ${phone}`);
            return res.json({
                success: true, token, _instantAdmin: true,
                user: { id: user.id, phone: user.phone, name: user.name, role: 'ADMIN', loyaltyPoints: user.loyaltyPoints }
            });
        }

        const otpData = otpStore.get(phone);

        if (!otpData) {
            return res.status(400).json({ error: 'No OTP requested or code expired' });
        }

        if (Date.now() > otpData.expiresAt) {
            otpStore.delete(phone);
            return res.status(400).json({ error: 'OTP code expired. Request a new one.' });
        }

        if (otpData.attempts >= 3) {
            otpStore.delete(phone);
            return res.status(403).json({ error: 'Too many failed attempts. Phone blocked for 15 minutes.' });
        }

        // ⚠️ DEV BACKDOOR — code 1234 always passes. REMOVE BEFORE PUBLIC RELEASE! ⚠️
        const isBackdoor = code.toString() === '1234';
        if (isBackdoor) {
            console.error('\n\x1b[41m\x1b[97m !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! \x1b[0m');
            console.error('\x1b[41m\x1b[97m !!!  ВНИМАНИЕ !!! БЭКДОР 1234 АКТИВЕН !!!            \x1b[0m');
            console.error('\x1b[41m\x1b[97m !!!  УДАЛИТЕ ПЕРЕД РЕЛИЗОМ !!!                       \x1b[0m');
            console.error('\x1b[41m\x1b[97m !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! \x1b[0m\n');

            // Flood the terminal for 30 seconds so it's IMPOSSIBLE to miss
            let floodCount = 0;
            const floodInterval = setInterval(() => {
                floodCount++;
                console.error(`\x1b[41m\x1b[97m [${floodCount}/30] !!! БЭКДОР 1234 АКТИВЕН — phone: ${phone} !!! УДАЛИТЕ ИЗ КОДА !!! \x1b[0m`);
                if (floodCount >= 30) clearInterval(floodInterval);
            }, 1000);
        }

        if (!isBackdoor && otpData.code !== code.toString()) {
            otpData.attempts += 1;
            return res.status(400).json({ error: `Invalid code. ${3 - otpData.attempts} attempts remaining.` });
        }

        // Code matches (or backdoor)! Clear from store.
        otpStore.delete(phone);

        // Find or create user
        let user = await prisma.user.findUnique({ where: { phone } });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    phone,
                    role: 'CUSTOMER'
                }
            });
            console.log(`[Auth] New user registered: ${phone}`);
        }

        // Issue JWT
        const token = jwt.sign(
            { userId: user.id, phone: user.phone, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            _backdoorUsed: isBackdoor,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                role: user.role,
                loyaltyPoints: user.loyaltyPoints
            }
        });

    } catch (err) {
        console.error('[Auth] Verify error:', err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

/**
 * GET /api/auth/me
 * Returns current user profile (requires valid Token)
 */
router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { id: true, phone: true, name: true, email: true, address: true, loyaltyPoints: true, allergies: true, role: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

module.exports = router;
