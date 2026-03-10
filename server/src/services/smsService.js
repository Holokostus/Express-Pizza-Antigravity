// ============================================================
// SMS.by Stub Service
// ============================================================
// Имитация белорусского SMS-шлюза SMS.by.
// В production: заменить _sendReal() на реальный API-вызов.
// Документация: https://sms.by/api/v1
// ============================================================

// In-memory OTP store: { phone: { code, expiresAt, attempts } }
const otpStore = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000;   // 5 минут
const MAX_ATTEMPTS = 5;                  // Максимум попыток ввода
const RATE_LIMIT_MS = 60 * 1000;         // 1 мин между SMS

// Last send timestamps for rate limiting
const lastSendTime = new Map();

/**
 * Generate a 4-digit OTP code
 */
function _generateCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Send SMS via SMS.by (STUB — logs to console)
 * Replace this function body with real API call in production.
 *
 * Real API example:
 * POST https://app.sms.by/api/v1/sendQuickSms
 * Headers: { Authorization: 'Bearer YOUR_SMSB_API_KEY' }
 * Body: { phone: '+375441234567', message: 'Express Pizza: ваш код 4821' }
 */
async function _sendViaSmsBy(phone, code) {
    // ---- STUB: replace with real SMS.by API call ----
    console.log(`\n📱 [SMS.by STUB] → ${phone}: Ваш код подтверждения Express Pizza: ${code}\n`);

    // Simulate network latency
    await new Promise(r => setTimeout(r, 300 + Math.random() * 200));

    return { success: true, messageId: `stub_${Date.now()}` };
    // ---- END STUB ----
}

/**
 * Send OTP to a phone number
 * @param {string} phone — E.164 format (+375...)
 * @returns {{ success: boolean, message?: string, expiresIn?: number }}
 */
async function sendOTP(phone) {
    // Rate limit: 1 SMS per minute
    const lastSent = lastSendTime.get(phone);
    if (lastSent && Date.now() - lastSent < RATE_LIMIT_MS) {
        const waitSec = Math.ceil((RATE_LIMIT_MS - (Date.now() - lastSent)) / 1000);
        return { success: false, message: `Подождите ${waitSec} сек. перед повторной отправкой` };
    }

    const code = _generateCode();
    const expiresAt = Date.now() + OTP_EXPIRY_MS;

    // Store OTP
    otpStore.set(phone, { code, expiresAt, attempts: 0 });
    lastSendTime.set(phone, Date.now());

    // Send via gateway
    const result = await _sendViaSmsBy(phone, code);

    if (result.success) {
        return { success: true, expiresIn: OTP_EXPIRY_MS / 1000 };
    }

    return { success: false, message: 'Ошибка отправки SMS. Попробуйте позже.' };
}

/**
 * Verify OTP code
 * @param {string} phone
 * @param {string} code
 * @returns {{ success: boolean, message?: string }}
 */
function verifyOTP(phone, code) {
    const entry = otpStore.get(phone);

    if (!entry) {
        return { success: false, message: 'Код не запрашивался. Отправьте SMS заново.' };
    }

    if (Date.now() > entry.expiresAt) {
        otpStore.delete(phone);
        return { success: false, message: 'Код истёк. Запросите новый.' };
    }

    if (entry.attempts >= MAX_ATTEMPTS) {
        otpStore.delete(phone);
        return { success: false, message: 'Превышено количество попыток. Запросите новый код.' };
    }

    entry.attempts++;

    if (entry.code !== code) {
        return { success: false, message: `Неверный код. Осталось попыток: ${MAX_ATTEMPTS - entry.attempts}` };
    }

    // Success — remove OTP
    otpStore.delete(phone);
    return { success: true };
}

module.exports = { sendOTP, verifyOTP };
