// ============================================================
// Local Node — Express Server (Restaurant Local-First)
// ============================================================
// Runs at each restaurant location. Accepts orders even when
// internet is down. Queues events in SQLite and syncs to cloud
// when connectivity is restored.
//
// Also drives ESC/POS receipt printer over LAN.
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.LOCAL_PORT || 3001;
const RESTAURANT_ID = parseInt(process.env.RESTAURANT_ID) || 1;

app.use(cors());
app.use(express.json());

// Initialize offline queue (SQLite)
const offlineQueue = require('./src/offlineQueue');
offlineQueue.init();

// Start cloud sync loop
const syncService = require('./src/syncService');
syncService.startSyncLoop();

// ============================================================
// Health / Status
// ============================================================

app.get('/api/health', (req, res) => {
    const status = syncService.getStatus();
    res.json({
        node: 'local',
        restaurantId: RESTAURANT_ID,
        port: PORT,
        ...status,
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// Offline Order Placement
// ============================================================

app.post('/api/orders', (req, res) => {
    try {
        const { items, customerName, customerPhone, customerAddress, payment } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Корзина пуста' });
        }

        const orderId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const externalOrderId = randomUUID();

        // Calculate total locally (basic — no promo code offline)
        let total = 0;
        const orderItems = items.map(item => {
            const lineTotal = (item.price || 0) * (item.quantity || 1);
            total += lineTotal;
            return {
                productId: item.productId,
                name: item.name,
                size: item.size,
                quantity: item.quantity || 1,
                unitPrice: item.price || 0,
                lineTotal,
                modifiers: item.modifiers || [],
            };
        });

        // Queue OrderPlaced event
        offlineQueue.enqueue(
            'OrderPlaced',
            'Order',
            externalOrderId,
            {
                localOrderId: orderId,
                externalOrderId,
                items: orderItems,
                subtotal: total,
                discount: 0,
                total,
                payment: payment || 'CASH_IKASSA',
                customer: {
                    name: customerName || 'Гость',
                    phone: customerPhone || '',
                    address: customerAddress || '',
                },
            },
            {
                source: 'LOCAL_NODE',
                restaurantId: RESTAURANT_ID,
            }
        );

        console.log(`[LocalNode] 📦 Order accepted: ${orderId} (total: ${total} BYN)`);

        // Print kitchen ticket if printer available
        printLocalKitchenTicket({
            id: orderId,
            orderNumber: orderId.slice(-6),
            customerName,
            items: orderItems,
            total,
        });

        res.status(201).json({
            success: true,
            orderId,
            externalOrderId,
            total,
            status: 'ACCEPTED_OFFLINE',
            message: 'Заказ принят. Синхронизация произойдет при восстановлении интернета.',
        });
    } catch (err) {
        console.error('[LocalNode] Order error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// Manual Sync Trigger
// ============================================================

app.post('/api/sync', async (req, res) => {
    try {
        const result = await syncService.syncBatch();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================================
// Queue Management
// ============================================================

app.get('/api/queue/stats', (req, res) => {
    res.json(offlineQueue.getStats());
});

app.post('/api/queue/cleanup', (req, res) => {
    offlineQueue.cleanup(req.body?.daysToKeep || 7);
    res.json({ success: true, stats: offlineQueue.getStats() });
});

// ============================================================
// Local Kitchen Ticket (simplified ESC/POS)
// ============================================================

function printLocalKitchenTicket(order) {
    const net = require('net');
    const printerIp = process.env.PRINTER_IP;
    const printerPort = parseInt(process.env.PRINTER_PORT) || 9100;

    if (!printerIp) {
        console.log('[LocalNode] No printer configured — ticket logged only');
        return;
    }

    // Build simple ESC/POS
    const ESC = 0x1b;
    const GS = 0x1d;
    const LF = 0x0a;

    const parts = [];
    const text = (s) => Buffer.from(s + '\n', 'utf-8');

    parts.push(Buffer.from([ESC, 0x40])); // Init
    parts.push(Buffer.from([ESC, 0x61, 0x01])); // Center
    parts.push(Buffer.from([GS, 0x21, 0x11])); // Double
    parts.push(text(`#${order.orderNumber}`));
    parts.push(Buffer.from([GS, 0x21, 0x00])); // Normal
    parts.push(text(new Date().toLocaleTimeString('ru-BY')));
    parts.push(text('─'.repeat(42)));
    parts.push(Buffer.from([ESC, 0x61, 0x00])); // Left

    for (const item of order.items) {
        parts.push(Buffer.from([ESC, 0x45, 0x01])); // Bold
        parts.push(text(`${item.quantity}x ${item.name} (${item.size || ''})`));
        parts.push(Buffer.from([ESC, 0x45, 0x00])); // Bold off

        for (const mod of (item.modifiers || [])) {
            parts.push(text(`   + ${mod.name}`));
        }
    }

    parts.push(text('─'.repeat(42)));
    parts.push(text(`${order.customerName || 'Гость'}`));
    parts.push(text('*** OFFLINE ***'));
    parts.push(Buffer.from([ESC, 0x64, 0x04])); // Feed
    parts.push(Buffer.from([GS, 0x56, 0x01])); // Cut

    const data = Buffer.concat(parts);

    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.connect(printerPort, printerIp, () => {
        socket.write(data, () => socket.end());
        console.log(`[LocalNode] 🖨 Kitchen ticket printed → ${printerIp}`);
    });
    socket.on('error', (err) => {
        console.error(`[LocalNode] Print error: ${err.message}`);
    });
}

// ============================================================
// Start
// ============================================================

app.listen(PORT, () => {
    console.log(`\n🏪 Express Pizza Local Node — http://localhost:${PORT}`);
    console.log(`🏷️  Restaurant ID: ${RESTAURANT_ID}`);
    console.log(`📦 Orders:   POST /api/orders (offline-capable)`);
    console.log(`🔄 Sync:     POST /api/sync (manual trigger)`);
    console.log(`📊 Queue:    GET  /api/queue/stats`);
    console.log(`❤️  Health:   GET  /api/health\n`);
});

process.on('SIGINT', () => {
    syncService.stopSyncLoop();
    process.exit(0);
});
