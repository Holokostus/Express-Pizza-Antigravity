#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const prisma = require('../server/src/lib/prisma');

async function main() {
    const phone = process.argv[2];

    if (!phone) {
        console.error('Usage: node scripts/make-admin.js <phone>');
        process.exit(1);
    }

    const user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
        console.error(`User with phone ${phone} not found.`);
        process.exit(1);
    }

    await prisma.user.update({
        where: { phone },
        data: { role: 'ADMIN' }
    });

    console.log(`✅ User ${phone} is now ADMIN.`);
}

main()
    .catch((error) => {
        console.error('Failed to promote user:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
