const ORDER_STATUS_ALLOWLIST = [
    'NEW',
    'CONFIRMED',
    'COOKING',
    'BAKING',
    'READY',
    'DELIVERY',
    'COMPLETED',
    'CANCELLED'
];

const ALLOWED_TRANSITIONS = {
    NEW: ['CONFIRMED', 'COOKING', 'CANCELLED'],
    CONFIRMED: ['COOKING', 'CANCELLED'],
    COOKING: ['BAKING', 'READY', 'CANCELLED'],
    BAKING: ['READY', 'CANCELLED'],
    READY: ['DELIVERY', 'COMPLETED', 'CANCELLED'],
    DELIVERY: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: []
};

const STATUS_ALIASES = {
    new: 'NEW',
    confirmed: 'CONFIRMED',
    cooking: 'COOKING',
    baking: 'BAKING',
    ready: 'READY',
    delivery: 'DELIVERY',
    completed: 'COMPLETED',
    cancelled: 'CANCELLED'
};

function buildBadRequestError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

function normalizeOrderStatus(rawStatus) {
    if (typeof rawStatus !== 'string') {
        throw buildBadRequestError('Order status must be a string');
    }

    const normalized = rawStatus.trim();
    if (!normalized) {
        throw buildBadRequestError('Order status is required');
    }

    return STATUS_ALIASES[normalized.toLowerCase()] || normalized.toUpperCase();
}

function assertKnownOrderStatus(status) {
    if (!ORDER_STATUS_ALLOWLIST.includes(status)) {
        throw buildBadRequestError(
            `Invalid order status "${status}". Allowed statuses: ${ORDER_STATUS_ALLOWLIST.join(', ')}`
        );
    }
}

function assertAllowedStatusTransition(currentStatus, nextStatus) {
    if (currentStatus === nextStatus) {
        return;
    }

    assertKnownOrderStatus(currentStatus);
    assertKnownOrderStatus(nextStatus);

    const allowedTargets = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedTargets.includes(nextStatus)) {
        throw buildBadRequestError(
            `Invalid order status transition: ${currentStatus} -> ${nextStatus}`
        );
    }
}

module.exports = {
    ORDER_STATUS_ALLOWLIST,
    ALLOWED_TRANSITIONS,
    normalizeOrderStatus,
    assertKnownOrderStatus,
    assertAllowedStatusTransition
};
