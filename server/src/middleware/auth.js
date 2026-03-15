// ============================================================
// Express Pizza — JWT Auth Middleware (Sprint 5)
// ============================================================

const { verifyToken, JWT_SECRET } = require('../utils/jwt');

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

    try {
        const decoded = verifyToken(token);
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
        try {
            req.user = verifyToken(token);
        } catch (err) {
            // Ignore token errors for optional auth, just leave req.user undefined
        }
    }
    next();
}

/**
 * Middleware: Role-based access control
 * @param {string[]} allowedRoles Array of allowed roles e.g., ['ADMIN', 'COOK']
 */
function checkRole(allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
        }

        next();
    };
}

const requireRole = checkRole;

module.exports = {
    requireAuth,
    optionalAuth,
    checkRole,
    requireRole,
    JWT_SECRET
};
