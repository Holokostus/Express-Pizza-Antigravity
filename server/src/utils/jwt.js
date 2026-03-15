// ============================================================
// JWT Utility — sign & verify tokens
// ============================================================

const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing.');
}

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
