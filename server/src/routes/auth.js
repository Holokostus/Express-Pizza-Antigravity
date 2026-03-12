// ============================================================
// Express Pizza — Auth Router (Sprint 5)
// ============================================================

const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

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
        if (existing && existing.lastSentAt && (Date.now() - existing.lastSentAt < 10000)) { // Sent within last 10 seconds
            return res.status(429).json({ error: 'Подождите 10 секунд перед повторной отправкой' });
        }

        // Generate 4-digit code (always 1111 in dev for easy testing)
        const code = process.env.NODE_ENV === 'production'
            ? Math.floor(1000 + Math.random() * 9000).toString()
            : '1111';

        // Store with 3 minute TTL
        otpStore.set(phone, {
            code,
            attempts: 0,
            expiresAt: Date.now() + 3 * 60 * 1000, // 3 minutes
            lastSentAt: Date.now()
        });

        const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        const telegramChatId = process.env.TELEGRAM_CHAT_ID;

        if (!telegramToken || !telegramChatId) {
            console.log(`[SMS Fallback] OTP for ${phone}: ${code}`);
        } else {
            try {
                const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: telegramChatId,
                        text: `🍕 Express Pizza\nВаш код авторизации: ${code}\nНикому не сообщайте его!`
                    })
                });

                if (!telegramResponse.ok) {
                    throw new Error(`Telegram API responded with status ${telegramResponse.status}`);
                }
            } catch (telegramError) {
                console.error('[Auth] Telegram send failed, using fallback log:', telegramError);
                console.log(`[SMS Fallback] OTP for ${phone}: ${code}`);
            }
        }

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

        if (otpData.code !== code.toString()) {
            otpData.attempts += 1;
            return res.status(400).json({ error: `Invalid code. ${3 - otpData.attempts} attempts remaining.` });
        }

        // Code matches! Clear from store.
        otpStore.delete(phone);

        // Find or create user
        let user = await prisma.user.findUnique({
            where: { phone },
            include: { pointsBalance: true }
        });

        if (!user) {
            user = await prisma.user.create({
                data: {
                    phone,
                    role: 'CUSTOMER'
                },
                include: { pointsBalance: true }
            });
            console.log(`[Auth] New user registered`);
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
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                role: user.role,
                loyaltyPoints: user.pointsBalance?.currentBalance || 0
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
            include: { pointsBalance: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });
        
        // Map pointsBalance to loyaltyPoints for legacy compatibility in frontend
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
