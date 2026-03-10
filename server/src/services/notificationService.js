// ============================================================
// Express Pizza — Telegram Notification Service (Sprint 3)
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// For Node 18+ native fetch
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Formats order data into a rich HTML message and sends it via Telegram Bot API
 * @param {object} orderData Prisma Order object including items and product relations
 */
async function sendOrderAlert(orderData) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn('⚠️ [Telegram] Missing BOT_TOKEN or CHAT_ID. Notification skipped.');
        // Fallback for local development
        console.dir(orderData, { depth: null, colors: true });
        return;
    }

    try {
        // Format Items List
        let itemsHtml = '';
        if (orderData.items && orderData.items.length > 0) {
            orderData.items.forEach((item, index) => {
                const productName = item.product ? item.product.name : 'Неизвестный товар';
                const sizeLabel = item.productSize ? ` (${item.productSize.label})` : '';
                itemsHtml += `▫️ ${index + 1}. <b>${productName}${sizeLabel}</b> x${item.quantity} — ${item.unitPrice} BYN\n`;

                // Add modifiers if any
                if (item.modifiers && item.modifiers.length > 0) {
                    item.modifiers.forEach(mod => {
                        const modName = mod.modifier ? mod.modifier.name : 'Опция';
                        itemsHtml += `   └ <i>+ ${modName}</i>\n`;
                    });
                }

                if (item.note) {
                    itemsHtml += `   💬 Комент: <i>${item.note}</i>\n`;
                }
            });
        } else {
            itemsHtml = '▫️ Товары не указаны\n';
        }

        const paymentEmoji = orderData.payment === 'BEPAID_ONLINE' ? '💳 Онлайн' :
            (orderData.payment === 'CASH_IKASSA' ? '💵 Наличные/Терминал' : '📲 Оплати');

        const statusEmoji = orderData.status === 'PAID' ? '✅ Оплачен' : '⏳ Ждет оплаты / НОВЫЙ';

        // Construct HTML Message
        const message = `
🍕 <b>НОВЫЙ ЗАКАЗ #${orderData.orderNumber || orderData.id}</b>
➖➖➖➖➖➖➖➖➖➖
👤 <b>Клиент:</b> ${orderData.customerName || 'Без имени'}
📞 <b>Телефон:</b> <a href="tel:${orderData.customerPhone}">${orderData.customerPhone}</a>
📍 <b>Адрес:</b> ${orderData.customerAddress}

🛒 <b>Состав заказа:</b>
${itemsHtml}
➖➖➖➖➖➖➖➖➖➖
💰 <b>Сумма:</b> ${orderData.total} BYN (скидка: ${orderData.discount || 0})
💳 <b>Оплата:</b> ${paymentEmoji}
✨ <b>Статус:</b> ${statusEmoji}
🕒 <b>Время:</b> ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' })}
`;

        // Send via Telegram API
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: CHAT_ID,
                text: message.trim(),
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });

        const result = await response.json();

        if (!result.ok) {
            console.error('[Telegram] API Error:', result.description);
        } else {
            console.log(`[Telegram] ✅ Alert sent for order #${orderData.orderNumber || orderData.id}`);
        }

    } catch (error) {
        console.error('[Telegram] Network/Execution Error:', error.message);
    }
}

module.exports = { sendOrderAlert };
