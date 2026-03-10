// ============================================================
// Express Pizza — Server Initialization (Sprint 2)
// ============================================================

const express = require('express');
const cors = require('cors');
const http = require('http');
const { PrismaClient } = require('@prisma/client');
const { initKDSWebSocket } = require('./src/services/kdsService');

// Initialize Prisma
const prisma = new PrismaClient();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Import Routes
const ordersRouter = require('./src/routes/orders');
const authRouter = require('./src/routes/auth');
const menuRouter = require('./src/routes/menu');
const kdsRouter = require('./src/routes/kds');

// Health Check
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
    } catch (e) {
        res.status(500).json({ status: 'degraded', db: 'disconnected', error: e.message });
    }
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/menu', menuRouter);
app.use('/api/kds', kdsRouter);
app.use('/api/orders', ordersRouter);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('[Global Error]', err);
    res.status(err.status || 500).json({
        error: true,
        message: err.message || 'Internal Server Error'
    });
});

// Create HTTP server needed for WebSocket binding
const server = http.createServer(app);

// Initialize KDS WebSocket server on top of HTTP server
initKDSWebSocket(server);

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Express Pizza] HTTP + WebSocket Server running on port ${PORT}`);
});

// Graceful Shutdown
process.on('SIGINT', async () => {
    console.log('\n[Express Pizza] Disconnecting Prisma...');
    await prisma.$disconnect();
    process.exit(0);
});
