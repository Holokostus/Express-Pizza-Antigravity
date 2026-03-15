// ============================================================
// JWT Utility — sign & verify tokens
// ============================================================

const jwt = require('jsonwebtoken');
function getJwtSecret() {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) return jwtSecret;

    if (process.env.NODE_ENV === 'test') {
        return 'test_jwt_secret';
    }

    throw new Error(
        `FATAL: JWT_SECRET environment variable is missing (NODE_ENV=${process.env.NODE_ENV || 'undefined'}). `
        + 'Set JWT_SECRET before starting the server.'
    );
}

const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = '7d';

/**
 * Sign a JWT token for a user payload
 * @param {object} payload
 * @returns {string} token
 */
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {object}
 */
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken, JWT_SECRET, JWT_EXPIRES_IN };
