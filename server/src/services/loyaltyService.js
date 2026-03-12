// ============================================================
// Loyalty Service (Immutable Ledger)
// ============================================================
// Manages awarding and redeeming loyalty points using ACID 
// transactions and idempotency keys to prevent fraud/double-spending.
// ============================================================

const prisma = require('../lib/prisma');

class LoyaltyService {
    /**
     * Award points to a user.
     * @param {number} userId - The user ID.
     * @param {number} amount - The amount of points to award (positive).
     * @param {string|null} orderId - Optional order ID reference.
     * @param {string} idempotencyKey - Unique key to prevent double awarding.
     */
    async awardPoints(userId, amount, orderId, idempotencyKey) {
        if (amount <= 0) {
            throw new Error('Очки для начисления должны быть положительными.');
        }

        try {
            await prisma.$transaction(async (tx) => {
                // 1. Create Immutable Ledger Entry
                await tx.pointsLedger.create({
                    data: {
                        userId,
                        amount,
                        transactionType: 'EARN',
                        orderId,
                        idempotencyKey,
                        // expirationDate can be set here if needed
                    }
                });

                // 2. Upsert Materialized Balance
                await tx.pointsBalance.upsert({
                    where: { userId },
                    update: { currentBalance: { increment: amount } },
                    create: { userId, currentBalance: amount },
                });
            });

            console.log(`[Loyalty] ✓ Начислено ${amount} баллов пользователю ${userId}`);
            return { success: true, message: 'Баллы успешно начислены' };

        } catch (error) {
            // P2002: Unique constraint failed on the constraint: `points_ledger_idempotencyKey_key`
            if (error.code === 'P2002' && error.meta?.target?.includes('idempotencyKey')) {
                console.log(`[Loyalty] ⚠️ Пропуск: Баллы по idempotencyKey ${idempotencyKey} уже начислены.`);
                return { success: true, message: 'Баллы уже были начислены (идемпотентность)' };
            }
            console.error('[Loyalty Error] Ошибка при начислении баллов:', error);
            throw error;
        }
    }

    /**
     * Redeem points from a user.
     * @param {number} userId - The user ID.
     * @param {number} amount - The amount of points to redeem (positive number expected).
     * @param {string|null} orderId - Optional order ID reference.
     * @param {string} idempotencyKey - Unique key to prevent double redeeming.
     */
    async redeemPoints(userId, amount, orderId, idempotencyKey) {
        if (amount <= 0) {
            throw new Error('Сумма списания должна быть положительной.');
        }

        try {
            await prisma.$transaction(async (tx) => {
                // 1. Check current balance
                const balance = await tx.pointsBalance.findUnique({
                    where: { userId }
                });

                if (!balance || balance.currentBalance < amount) {
                    throw new Error('Недостаточно баллов');
                }

                // 2. Create Immutable Ledger Entry (Negative Amount)
                await tx.pointsLedger.create({
                    data: {
                        userId,
                        amount: -amount,
                        transactionType: 'REDEEM',
                        orderId,
                        idempotencyKey,
                    }
                });

                // 3. Update Materialized Balance
                await tx.pointsBalance.update({
                    where: { userId },
                    data: { currentBalance: { decrement: amount } },
                });
            });

            console.log(`[Loyalty] ✓ Списано ${amount} баллов у пользователя ${userId}`);
            return { success: true, message: 'Баллы успешно списаны' };

        } catch (error) {
            if (error.code === 'P2002' && error.meta?.target?.includes('idempotencyKey')) {
                console.log(`[Loyalty] ⚠️ Пропуск: Баллы по idempotencyKey ${idempotencyKey} уже списаны.`);
                return { success: true, message: 'Баллы уже были списаны (идемпотентность)' };
            }
            console.error('[Loyalty Error] Ошибка при списании баллов:', error);
            throw error;
        }
    }
}

module.exports = new LoyaltyService();
