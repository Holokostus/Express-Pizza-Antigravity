// ============================================================
// Express Pizza — telegram.js (Phase 9: Client Stub)
// ============================================================
// Telegram notifications are now handled SERVER-SIDE.
// This file is kept for backward compatibility with any code
// that calls sendOrderToTelegram() — it now does nothing.
//
// The real bot token is in server/.env (NEVER on the client).
// Server sends Telegram messages via:
//   server/src/services/telegramService.js
// ============================================================

/**
 * @deprecated — Telegram messages are now sent by the server.
 * This stub exists only for backward compatibility.
 */
async function sendOrderToTelegram(orderData) {
    console.log('[Telegram] Notifications moved to server-side. This client stub does nothing.');
    return true;
}
