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

async function sendOtpEmail({ to, code }) {
    if (!to || !code) {
        throw new Error('Email and OTP code are required');
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('EMAIL_USER and EMAIL_PASS must be configured');
    }

    await mailTransport.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: String(to).trim(),
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
