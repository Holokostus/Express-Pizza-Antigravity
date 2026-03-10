// ============================================================
// Express Pizza — ESC/POS Receipt Service (Sprint 4)
// ============================================================

const iconv = require('iconv-lite');

// ESC/POS Commands
const CMD = {
    INIT: [0x1B, 0x40], // Initialize printer
    LF: [0x0A],         // Line feed
    BOLD_ON: [0x1B, 0x45, 0x01],
    BOLD_OFF: [0x1B, 0x45, 0x00],
    TXT_NORMAL: [0x1D, 0x21, 0x00],
    TXT_2HEIGHT: [0x1D, 0x21, 0x01],
    TXT_2WIDTH: [0x1D, 0x21, 0x10],
    TXT_4SQUARE: [0x1D, 0x21, 0x11],
    ALIGN_LEFT: [0x1B, 0x61, 0x00],
    ALIGN_CENTER: [0x1B, 0x61, 0x01],
    ALIGN_RIGHT: [0x1B, 0x61, 0x02],
    CUT: [0x1D, 0x56, 0x41, 0x03], // Partial cut
    CODEPAGE_CP866: [0x1B, 0x74, 0x11] // Set code page to CP866 (Cyrillic)
};

class ReceiptBuilder {
    constructor() {
        this.buffer = [];
        this.add(CMD.INIT);
        this.add(CMD.CODEPAGE_CP866); // Critical for Russian text on thermal printers
    }

    add(cmdArray) {
        this.buffer.push(Buffer.from(cmdArray));
    }

    text(str, bold = false) {
        if (bold) this.add(CMD.BOLD_ON);
        // Encode JavaScript UTF-8 string to Cyrillic CP866 for the printer
        this.buffer.push(iconv.encode(str, 'cp866'));
        if (bold) this.add(CMD.BOLD_OFF);
        this.add(CMD.LF);
    }

    center(str, bold = false) {
        this.add(CMD.ALIGN_CENTER);
        this.text(str, bold);
        this.add(CMD.ALIGN_LEFT);
    }

    sep() {
        this.text('-'.repeat(48)); // Standard 80mm printer is 48 chars wide
    }

    feed(lines = 1) {
        for (let i = 0; i < lines; i++) this.add(CMD.LF);
    }

    cut() {
        this.feed(3);
        this.add(CMD.CUT);
    }

    build() {
        return Buffer.concat(this.buffer);
    }
}

/**
 * Generates raw ESC/POS binary buffer for a kitchen ticket or customer receipt
 * @param {object} order Complete Order object with included items, products, modifiers
 * @param {string} type "KITCHEN" or "SERVICE"
 * @returns {Buffer} Raw bytes ready to be sent over TCP to port 9100
 */
function generateReceiptBuffer(order, type = 'SERVICE') {
    const builder = new ReceiptBuilder();

    // ── HEADER ──
    builder.add(CMD.TXT_2HEIGHT);
    builder.center(type === 'KITCHEN' ? 'КУХОННЫЙ ТИКЕТ' : 'EXPRESS PIZZA', true);
    builder.add(CMD.TXT_NORMAL);

    builder.center(`Заказ #${order.orderNumber || order.id}`, true);
    builder.center(new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' }));
    builder.feed();
    builder.sep();

    // ── ITEMS ──
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
            const name = item.product ? item.product.name : 'Товар';
            const size = item.productSize ? ` (${item.productSize.label})` : '';

            builder.add(CMD.BOLD_ON);
            builder.text(`${item.quantity} x ${name}${size}`);
            builder.add(CMD.BOLD_OFF);

            // Modifiers — Critical for Kitchen!
            if (item.modifiers && item.modifiers.length > 0) {
                item.modifiers.forEach(m => {
                    const modName = m.modifier ? m.modifier.name : 'Модификатор';
                    // If modifier is a removal (e.g. "БЕЗ ЛУКА"), emphasize it
                    const isRemoval = m.modifier && m.modifier.isRemoval;

                    if (type === 'KITCHEN') {
                        // High contrast for kitchen
                        if (isRemoval) {
                            builder.add(CMD.TXT_2HEIGHT);
                            builder.text(` !!! БЕЗ: ${modName.replace('Без ', '').toUpperCase()} !!!`);
                            builder.add(CMD.TXT_NORMAL);
                        } else {
                            builder.text(`   + ${modName}`);
                        }
                    } else {
                        builder.text(`   + ${modName}`);
                    }
                });
            }

            if (item.note) {
                builder.text(`   Комментарий: ${item.note}`);
            }
            builder.feed();
        });
    }

    builder.sep();

    // ── FOOTER / TOTALS (Only for Service Receipt) ──
    if (type === 'SERVICE') {
        builder.text(`Сумма без скидки: ${order.subtotal} BYN`);
        if (order.discount > 0) {
            builder.text(`Скидка:           ${order.discount} BYN`);
        }
        builder.add(CMD.TXT_2HEIGHT);
        builder.text(`ИТОГО:            ${order.total} BYN`, true);
        builder.add(CMD.TXT_NORMAL);

        const paymentStr = order.payment === 'BEPAID_ONLINE' ? 'ОПЛАЧЕНО ОНЛАЙН' :
            (order.payment === 'CASH_IKASSA' ? 'НАЛИЧНЫЕ / ТЕРМИНАЛ' : 'ОПЛАТИ QR');
        builder.text(`Место расчетов:   ${paymentStr}`, true);

        builder.feed();
        builder.center('ООО "Экспресс Пицца"');
        builder.center('УНП 193000000');
        builder.center('СПАСИБО ЗА ЗАКАЗ!');
    } else {
        // Kitchen specific footer
        builder.center(`Для: ${order.customerName} (${order.customerPhone})`);
        builder.center(`Тип: ${order.source}`);
    }

    builder.cut();
    return builder.build();
}

module.exports = { generateReceiptBuffer };
