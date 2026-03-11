const { PrismaClient } = require('@prisma/client');

// Use a global variable to prevent multiple instances during hot-reloading in dev
const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}

module.exports = prisma;
