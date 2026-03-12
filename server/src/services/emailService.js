const { Resend } = require('resend');

const resendClient = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

async function sendOtpEmail({ to, code }) {
    if (!to || !code) {
        throw new Error('Email and OTP code are required');
    }

    if (!resendClient) {
        throw new Error('RESEND_API_KEY is not configured');
    }

    await resendClient.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
        to,
        subject: 'Ваш код входа в Express Pizza',
        html: `
            <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: 0 auto;">
                <h2 style="margin-bottom: 8px;">Express Pizza</h2>
                <p style="margin-top: 0; color: #555;">Ваш одноразовый код подтверждения:</p>
                <div style="font-size: 32px; letter-spacing: 8px; font-weight: 700; color: #E30613; margin: 20px 0;">${code}</div>
                <p style="color: #555;">Код действует 3 минуты. Никому его не сообщайте.</p>
            </div>
        `,
    });
}

module.exports = { sendOtpEmail };
