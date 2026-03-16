const nodemailer = require('nodemailer');

const mailTransport = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT || 465),
    secure: String(process.env.EMAIL_SECURE || 'true') !== 'false',
    connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 8000),
    greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS || 8000),
    socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS || 10000),
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function buildOtpEmailHtml(code) {
    return `
        <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #fee2e2; border-radius: 16px; overflow: hidden;">
            <div style="padding: 20px 24px; background: linear-gradient(135deg, #e30613, #ff6b5f); color: #fff;">
                <h2 style="margin: 0; font-size: 20px;">🍕 Express Pizza</h2>
                <p style="margin: 6px 0 0; opacity: .9;">Код для входа в личный кабинет</p>
            </div>
            <div style="padding: 24px; color: #374151;">
                <p style="margin: 0 0 8px;">Ваш одноразовый код подтверждения:</p>
                <div style="font-size: 36px; letter-spacing: 10px; font-weight: 800; color: #E30613; margin: 16px 0 20px;">${code}</div>
                <p style="margin: 0 0 6px; color: #6b7280;">Код действует <b>3 минуты</b>.</p>
                <p style="margin: 0; color: #9ca3af; font-size: 13px;">Если это были не вы — просто проигнорируйте письмо.</p>
            </div>
        </div>
    `;
}

async function sendViaResend({ to, code }) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('RESEND_API_KEY is not configured');
    }

    const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Express Pizza <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from,
            to: [String(to).trim()],
            subject: 'Ваш код входа в Express Pizza',
            html: buildOtpEmailHtml(code),
        }),
    });

    if (!response.ok) {
        const payload = await response.text().catch(() => '');
        throw new Error(`Resend request failed (${response.status}): ${payload}`);
    }
}

async function sendViaSmtp({ to, code }) {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('EMAIL_USER and EMAIL_PASS must be configured for SMTP fallback');
    }

    await mailTransport.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: String(to).trim(),
        subject: 'Ваш код входа в Express Pizza',
        html: buildOtpEmailHtml(code),
    });
}

async function sendOtpEmail({ to, code }) {
    if (!to || !code) {
        throw new Error('Email and OTP code are required');
    }

    const transport = String(process.env.EMAIL_TRANSPORT || 'resend').toLowerCase();

    if (transport === 'smtp') {
        await sendViaSmtp({ to, code });
        return;
    }

    try {
        await sendViaResend({ to, code });
    } catch (resendError) {
        if (transport === 'resend') {
            throw resendError;
        }

        await sendViaSmtp({ to, code });
    }
}

module.exports = { sendOtpEmail };
