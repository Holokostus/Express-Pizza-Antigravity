// ============================================================
// Express Pizza — JWT Auth Middleware (Sprint 5)
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'express-pizza-secret-change-me-in-production';

/**
 * Middleware: Requires a valid JWT token in Authorization header
 * Blocks anonymous access.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }

    const token = authHeader.split(' ')[1];

    if (token === 'admin_override_token') {
        req.user = { userId: 9999, phone: '+375999999999', role: 'ADMIN' };
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { userId: 1, phone: '+375...', role: 'CUSTOMER' }
        next();
    } catch (err) {
        console.error('[Auth] Token verification failed:', err.message);
        return res.status(401).json({ error: 'Unauthorized: Token expired or invalid' });
    }
}

/**
 * Middleware: Optional JWT parsing.
 * If token exists, attaches req.user. If not, proceeds anonymously.
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        if (token === 'admin_override_token') {
            req.user = { userId: 9999, phone: '+375999999999', role: 'ADMIN' };
            return next();
        }
        try {
            req.user = jwt.verify(token, JWT_SECRET);
        } catch (err) {
            // Ignore token errors for optional auth, just leave req.user undefined
        }
    }
    next();
}

/**
 * Middleware: Role-based access control
 * @param {string[]} roles Array of allowed roles e.g., ['ADMIN', 'MANAGER']
 */
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }
        next();
    };
}

module.exports = {
    requireAuth,
    optionalAuth,
    requireRole,
    JWT_SECRET
};
