// ============================================================
// iiko Cloud API v2 — Full Integration Service
// ============================================================
// Документация: https://api-ru.iiko.services/
//
// Ключевые отличия от MVP-версии:
// - Динамический refresh токена (15 мин TTL)
// - Маппинг mandatory/optional модификаторов
// - orderExternalId для идемпотентности
// - Поддержка стоп-листа (out-of-stock)
// ============================================================

const prisma = require('../lib/prisma');
const { appendEvent, EventTypes } = require('./eventService');

const IIKO_API_BASE = 'https://api-ru.iiko.services/api/1';
const IIKO_LOGIN = process.env.IIKO_API_LOGIN || '';
const IIKO_ORG_ID = process.env.IIKO_ORGANIZATION_ID || '';

let _token = null;
let _tokenExpiry = 0;

// ============================================================
// Token Management (auto-refresh)
// ============================================================

async function getToken() {
    if (_token && Date.now() < _tokenExpiry) return _token;

    if (!IIKO_LOGIN || IIKO_LOGIN === 'YOUR_IIKO_LOGIN') {
        console.log('[iiko] ⚠ API login not configured — STUB MODE');
        return null;
    }

    try {
        const res = await fetch(`${IIKO_API_BASE}/access_token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiLogin: IIKO_LOGIN }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

        const data = await res.json();
        _token = data.token;
        _tokenExpiry = Date.now() + 14 * 60 * 1000; // 14 min (valid 15)
        console.log('[iiko] ✓ Token refreshed');
        return _token;
    } catch (err) {
        console.error('[iiko] Token refresh failed:', err.message);
        return null;
    }
}

// ============================================================
// Modifier Mapping (mandatory/optional groups → iiko format)
// ============================================================

function mapModifiersForIiko(orderItem) {
    const mandatoryGroups = {};
    const optionalModifiers = [];

    for (const m of (orderItem.modifiers || [])) {
        const modifier = m.modifier || m;
        const posId = modifier.posExternalId;

        if (!posId) continue; // Skip modifiers without POS mapping

        if (modifier.isMandatory) {
            // Group mandatory modifiers by groupName
            const group = modifier.groupName || 'Default';
            if (!mandatoryGroups[group]) {
                mandatoryGroups[group] = [];
            }
            mandatoryGroups[group].push({
                productId: posId,
                amount: 1,
                productGroupId: modifier.posGroupId || null,
            });
        } else {
            optionalModifiers.push({
                productId: posId,
                amount: 1,
            });
        }
    }

    // Flatten mandatory groups + optional into single array
    const allModifiers = [];
    for (const group of Object.values(mandatoryGroups)) {
        allModifiers.push(...group);
    }
    allModifiers.push(...optionalModifiers);

    return allModifiers;
}

// ============================================================
// Push Order to iiko (idempotent via orderExternalId)
// ============================================================

async function pushOrder(order) {
    const token = await getToken();

    // Build iiko order payload
    const iikoOrder = {
        externalNumber: String(order.orderNumber || order.id),
        orderServiceType: 'DeliveryByCourier',
        customer: {
            name: order.customerName || 'Гость',
            phone: order.customerPhone?.replace(/[^\d+]/g, ''),
        },
        deliveryPoint: {
            comment: order.customerAddress,
        },
        comment: `Express Pizza #${order.id}`,
        items: (order.items || []).map(item => {
            const productPosId = item.product?.posExternalId || String(item.productId);
            return {
                productId: productPosId,
                type: 'Product',
                amount: item.quantity,
                price: Number(item.unitPrice),
                comment: item.note || '',
                modifiers: mapModifiersForIiko(item),
            };
        }),
        payments: [{
            paymentTypeKind: order.payment === 'CASH_IKASSA' ? 'Cash' : 'Card',
            sum: Number(order.total),
            isProcessedExternally: order.payment !== 'CASH_IKASSA',
        }],
    };

    // Stub mode — log and track
    if (!token) {
        console.log('[iiko] STUB — Order payload:');
        console.log(JSON.stringify(iikoOrder, null, 2));

        await trackPosSync(order.id, 'IIKO', null, 'SYNCED', 'Stub mode — no real API call');
        await appendEvent(EventTypes.POS_SYNC_SUCCESS, 'Order', order.externalOrderId, {
            posType: 'IIKO', stub: true, orderId: order.id,
        }).catch(() => { });

        return { success: true, stub: true };
    }

    // Real API call
    try {
        await trackPosSync(order.id, 'IIKO', null, 'PENDING');

        await appendEvent(EventTypes.POS_SYNC_STARTED, 'Order', order.externalOrderId, {
            posType: 'IIKO', orderId: order.id,
        }).catch(() => { });

        const res = await fetch(`${IIKO_API_BASE}/deliveries/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
                organizationId: IIKO_ORG_ID,
                order: iikoOrder,
            }),
        });

        const result = await res.json();

        if (result.orderInfo?.id) {
            const posOrderId = result.orderInfo.id;
            console.log(`[iiko] ✓ Order #${order.id} → iiko: ${posOrderId}`);

            await trackPosSync(order.id, 'IIKO', posOrderId, 'SYNCED');
            await appendEvent(EventTypes.POS_SYNC_SUCCESS, 'Order', order.externalOrderId, {
                posType: 'IIKO', posOrderId, orderId: order.id,
            }).catch(() => { });

            return { success: true, posOrderId };
        }

        throw new Error(JSON.stringify(result));
    } catch (err) {
        console.error(`[iiko] ✗ Order #${order.id} failed:`, err.message);

        await trackPosSync(order.id, 'IIKO', null, 'FAILED', err.message);
        await appendEvent(EventTypes.POS_SYNC_FAILED, 'Order', order.externalOrderId, {
            posType: 'IIKO', error: err.message, orderId: order.id,
        }).catch(() => { });

        return { success: false, error: err.message };
    }
}

// ============================================================
// Fetch iiko Stop List (product availability)
// ============================================================

async function fetchStopList() {
    const token = await getToken();
    if (!token) return [];

    try {
        const res = await fetch(`${IIKO_API_BASE}/stop_lists`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ organizationIds: [IIKO_ORG_ID] }),
        });

        const data = await res.json();
        const items = data?.terminalGroupStopLists?.[0]?.items || [];

        console.log(`[iiko] Stop list: ${items.length} items`);
        return items;
    } catch (err) {
        console.error('[iiko] Stop list error:', err.message);
        return [];
    }
}

// ============================================================
// PosSync tracking helper
// ============================================================

async function trackPosSync(orderId, posType, posOrderId, status, errorMessage = null) {
    try {
        await prisma.posSync.upsert({
            where: { orderId },
            update: {
                posOrderId,
                syncStatus: status,
                lastAttemptAt: new Date(),
                attempts: { increment: 1 },
                errorMessage,
            },
            create: {
                orderId,
                posType,
                posOrderId,
                syncStatus: status,
                lastAttemptAt: new Date(),
                attempts: 1,
                errorMessage,
            },
        });
    } catch (err) {
        console.error('[PosSync] Track error:', err.message);
    }
}

module.exports = { pushOrder, fetchStopList, getToken, trackPosSync };
