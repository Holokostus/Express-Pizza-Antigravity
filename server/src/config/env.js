// ============================================================
// Environment configuration
// ============================================================

const REQUIRED_AUTH_ENV_VARS = ['JWT_SECRET'];
const REQUIRED_PAYMENT_ENV_VARS = [
    'BEPAID_SHOP_ID',
    'BEPAID_SECRET_KEY',
    'BEPAID_WEBHOOK_SECRET',
];

const REQUIRED_ENV_VARS = [
    ...REQUIRED_AUTH_ENV_VARS,
    ...REQUIRED_PAYMENT_ENV_VARS,
];

function getMissingEnvVars(env = process.env) {
    return REQUIRED_ENV_VARS.filter((key) => !env[key] || String(env[key]).trim() === '');
}

function validateEnv(env = process.env) {
    const missing = getMissingEnvVars(env);

    if (missing.length > 0) {
        throw new Error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
    }
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

module.exports = {
    REQUIRED_AUTH_ENV_VARS,
    REQUIRED_PAYMENT_ENV_VARS,
    REQUIRED_ENV_VARS,
    getMissingEnvVars,
    validateEnv,
    JWT_SECRET,
    JWT_EXPIRES_IN,
};
