// ============================================================
// Telegram Notification Service (SERVER-SIDE)
// ============================================================
// Bot token is read from .env — NEVER exposed to the client.
// Sends formatted HTML order notifications to the manager chat.
// Includes retry with exponential backoff.
// ============================================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

const PAYMENT_LABELS = {
    'BEPAID_ONLINE': '💳 Картой онлайн (bePaid)',
    'OPLATI_QR': '📱 Оплати (QR-код)',
    'CASH_IKASSA': '💵 Наличные / Терминал iKassa',
};

/**
 * Format order data into Telegram HTML message
 */
function formatOrderMessage(order) {
    let msg = `🍕 <b>Новый заказ #${order.id}</b>\n\n`;
    msg += `👤 <b>Имя:</b> ${order.customerName || '—'}\n`;
    msg += `📞 <b>Телефон:</b> ${order.customerPhone}\n`;
    msg += `📍 <b>Адрес:</b> ${order.customerAddress}\n`;
    msg += `💰 <b>Оплата:</b> ${PAYMENT_LABELS[order.payment] || order.payment}\n`;

    if (order.promoCode) {
        msg += `🏷️ <b>Промокод:</b> ${order.promoCode.code} (${order.promoCode.label})\n`;
    }

    msg += `\n🛒 <b>Состав заказа:</b>\n`;

    for (const item of (order.items || [])) {
        const name = item.product?.name || 'Товар';
        const size = item.productSize?.label || '';
        const qty = item.quantity;
        const price = Number(item.unitPrice) * qty;
        const mods = (item.modifiers || []).map(m => m.modifier?.name).filter(Boolean);
        const modsStr = mods.length > 0 ? ` [${mods.join(', ')}]` : '';
        msg += `— ${name} (${size}, ${qty} шт)${modsStr} = ${price.toFixed(2)} руб.\n`;
    }

    msg += `\n📦 <b>Подытог:</b> ${Number(order.subtotal).toFixed(2)} руб.`;
    if (Number(order.discount) > 0) {
        msg += `\n🏷️ <b>Скидка:</b> −${Number(order.discount).toFixed(2)} руб.`;
    }
    msg += `\n💰 <b>Итого:</b> ${Number(order.total).toFixed(2)} руб.`;

    return msg;
}

/**
 * Send message to Telegram with retry (3 attempts, exponential backoff)
 */
async function sendTelegramMessage(text) {
    if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
        console.log('[Telegram] Bot token not configured. Message logged:');
        console.log(text.replace(/<[^>]+>/g, ''));
        return false;
    }

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text,
                    parse_mode: 'HTML',
                }),
            });

            const result = await response.json();
            if (result.ok) {
                console.log(`[Telegram] ✓ Message sent (attempt ${attempt})`);
                return true;
            }

            console.error(`[Telegram] API error (attempt ${attempt}):`, result.description);
        } catch (err) {
            console.error(`[Telegram] Network error (attempt ${attempt}):`, err.message);
        }

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
        }
    }

    console.error('[Telegram] ✗ All retries exhausted.');
    return false;
}

/**
 * Notify manager about a new order
 */
async function notifyNewOrder(order) {
    const message = formatOrderMessage(order);
    return sendTelegramMessage(message);
}

/**
 * Notify manager about order status change
 */
async function notifyStatusChange(order, newStatus) {
    const statusEmoji = {
        COOKING: '👨‍🍳', BAKING: '🔥', DELIVERY: '🚗', COMPLETED: '✅', CANCELLED: '❌',
    };
    const text = `${statusEmoji[newStatus] || '📋'} Заказ #${order.id} — статус: <b>${newStatus}</b>\n📞 ${order.customerPhone}`;
    return sendTelegramMessage(text);
}

module.exports = { notifyNewOrder, notifyStatusChange, sendTelegramMessage };
