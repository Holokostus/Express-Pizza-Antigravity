// ============================================================
// r_keeper White Server — JSON-RPC Integration Service
// ============================================================
// Документация: r_keeper White Server JSON-RPC API
//
// Ключевые методы:
// - ValidateOrder: проверка цен и наличия на кухне ДО оплаты
// - CreateOrder: создание заказа после успешной валидации
//
// Всё общение через JSON-RPC 2.0 over HTTP.
// ============================================================

const prisma = require('../lib/prisma');
const { appendEvent, EventTypes } = require('./eventService');

const RK_BASE_URL = process.env.RKEEPER_URL || 'http://localhost:8080/jsonrpc';
const RK_API_KEY = process.env.RKEEPER_API_KEY || '';

let _requestId = 0;

// ============================================================
// JSON-RPC 2.0 Transport
// ============================================================

async function jsonRpcCall(method, params = {}) {
    _requestId++;

    const body = {
        jsonrpc: '2.0',
        id: _requestId,
        method,
        params,
    };

    if (!RK_API_KEY || RK_API_KEY === 'YOUR_RKEEPER_KEY') {
        console.log(`[r_keeper] STUB — ${method}:`, JSON.stringify(params, null, 2));
        return _stubResponse(method, params);
    }

    try {
        const res = await fetch(RK_BASE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RK_API_KEY}`,
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (data.error) {
            throw new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
        }

        return data.result;
    } catch (err) {
        console.error(`[r_keeper] ${method} failed:`, err.message);
        throw err;
    }
}

// ============================================================
// ValidateOrder — Check prices & kitchen availability
// ============================================================
// MUST be called BEFORE charging the client's card!
// Returns: { valid: true, adjustedTotal, unavailableItems[] }

async function validateOrder(order) {
    try {
        await appendEvent(EventTypes.POS_SYNC_STARTED, 'Order', order.externalOrderId, {
            posType: 'RKEEPER', action: 'ValidateOrder', orderId: order.id,
        }).catch(() => { });

        const result = await jsonRpcCall('ValidateOrder', {
            externalId: order.externalOrderId,
            items: (order.items || []).map(item => ({
                productId: item.product?.posExternalId || String(item.productId),
                name: item.product?.name,
                quantity: item.quantity,
                price: Number(item.unitPrice),
                modifiers: (item.modifiers || []).map(m => ({
                    id: m.modifier?.posExternalId || String(m.modifierId),
                    name: m.modifier?.name,
                    price: Number(m.priceAtOrder),
                })),
            })),
            total: Number(order.total),
        });

        // Track validation result
        await prisma.posSync.upsert({
            where: { orderId: order.id },
            update: {
                syncStatus: result.valid ? 'VALIDATING' : 'FAILED',
                validationResult: result,
                lastAttemptAt: new Date(),
                attempts: { increment: 1 },
            },
            create: {
                orderId: order.id,
                posType: 'RKEEPER',
                syncStatus: result.valid ? 'VALIDATING' : 'FAILED',
                validationResult: result,
                lastAttemptAt: new Date(),
                attempts: 1,
                errorMessage: result.valid ? null : 'Validation failed',
            },
        });

        await appendEvent(EventTypes.POS_VALIDATED, 'Order', order.externalOrderId, {
            posType: 'RKEEPER', valid: result.valid, result, orderId: order.id,
        }).catch(() => { });

        console.log(`[r_keeper] ValidateOrder #${order.id}: ${result.valid ? '✓ OK' : '✗ FAILED'}`);
        return result;
    } catch (err) {
        console.error(`[r_keeper] ValidateOrder #${order.id} error:`, err.message);
        return { valid: false, error: err.message, unavailableItems: [] };
    }
}

// ============================================================
// CreateOrder — Push validated order to r_keeper
// ============================================================

async function createOrder(order) {
    try {
        const result = await jsonRpcCall('CreateOrder', {
            externalId: order.externalOrderId,
            orderType: 'delivery',
            customer: {
                name: order.customerName,
                phone: order.customerPhone,
            },
            address: order.customerAddress,
            items: (order.items || []).map(item => ({
                productId: item.product?.posExternalId || String(item.productId),
                quantity: item.quantity,
                price: Number(item.unitPrice),
                modifiers: (item.modifiers || []).map(m => ({
                    id: m.modifier?.posExternalId || String(m.modifierId),
                    price: Number(m.priceAtOrder),
                })),
            })),
            payment: {
                type: order.payment === 'CASH_IKASSA' ? 'cash' : 'card',
                amount: Number(order.total),
            },
        });

        const posOrderId = result?.orderId || result?.id || null;

        await prisma.posSync.upsert({
            where: { orderId: order.id },
            update: {
                posOrderId,
                syncStatus: 'SYNCED',
                lastAttemptAt: new Date(),
                attempts: { increment: 1 },
            },
            create: {
                orderId: order.id,
                posType: 'RKEEPER',
                posOrderId,
                syncStatus: 'SYNCED',
                lastAttemptAt: new Date(),
                attempts: 1,
            },
        });

        await appendEvent(EventTypes.POS_SYNC_SUCCESS, 'Order', order.externalOrderId, {
            posType: 'RKEEPER', posOrderId, orderId: order.id,
        }).catch(() => { });

        console.log(`[r_keeper] ✓ Order #${order.id} → r_keeper: ${posOrderId}`);
        return { success: true, posOrderId };
    } catch (err) {
        await prisma.posSync.upsert({
            where: { orderId: order.id },
            update: {
                syncStatus: 'FAILED',
                errorMessage: err.message,
                lastAttemptAt: new Date(),
                attempts: { increment: 1 },
            },
            create: {
                orderId: order.id,
                posType: 'RKEEPER',
                syncStatus: 'FAILED',
                errorMessage: err.message,
                lastAttemptAt: new Date(),
                attempts: 1,
            },
        });

        await appendEvent(EventTypes.POS_SYNC_FAILED, 'Order', order.externalOrderId, {
            posType: 'RKEEPER', error: err.message, orderId: order.id,
        }).catch(() => { });

        console.error(`[r_keeper] ✗ Order #${order.id} failed:`, err.message);
        return { success: false, error: err.message };
    }
}

// ============================================================
// Stub responses for development
// ============================================================

function _stubResponse(method, params) {
    switch (method) {
        case 'ValidateOrder':
            return {
                valid: true,
                adjustedTotal: params.total,
                unavailableItems: [],
                message: 'Stub: all items available',
            };
        case 'CreateOrder':
            return {
                orderId: `rk_stub_${Date.now()}`,
                status: 'accepted',
            };
        default:
            return { status: 'ok', stub: true };
    }
}

module.exports = { validateOrder, createOrder, jsonRpcCall };
