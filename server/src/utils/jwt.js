// ============================================================
// JWT Utility — sign & verify tokens
// ============================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing.');
}
const JWT_EXPIRES_IN = '7d';

/**
 * Sign a JWT token for a user
 * @param {{ id: number, phone: string, role: string }} user
 * @returns {string} token
 */
function signToken(user) {
    return jwt.sign(
        { userId: user.id, phone: user.phone, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
    );
}

/**
 * Verify and decode a JWT token
 * @param {string} token
 * @returns {{ userId: number, phone: string, role: string }}
 */
function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken, JWT_SECRET };
