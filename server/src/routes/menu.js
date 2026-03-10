// ============================================================
// Express Pizza — Menu API Router (Sprint 5)
// ============================================================

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { requireRole } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/menu
 * Returns the entire nested catalog tree:
 * Categories -> Products (w/ KBJU & Allergens) -> Sizes & Modifiers
 */
router.get('/', async (req, res) => {
    try {
        // Fetch categories with nested products, sizes, and linked modifiers
        const categories = await prisma.category.findMany({
            orderBy: { sortOrder: 'asc' },
            include: {
                products: {
                    where: { isAvailable: true }, // Only show available items
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        sizes: {
                            select: {
                                id: true,
                                label: true,
                                weight: true,
                                price: true
                            }
                        },
                        modifiers: {
                            select: {
                                id: true,
                                name: true,
                                price: true,
                                isRemoval: true,
                                groupName: true,
                                isMandatory: true,
                                maxQuantity: true
                            }
                        }
                    }
                }
            }
        });

        // We fetch allergens separately to build a lookup map to avoid duplicating the full allergen object
        // inside every product that contains it. The product just stores array of slugs: ["gluten", "eggs"].
        const allergens = await prisma.allergen.findMany();

        res.json({
            success: true,
            categories,
            allergensDefinition: allergens // Frontend uses this to translate slugs to emojis/names
        });

    } catch (err) {
        console.error('[Menu API] Error fetching menu:', err);
        res.status(500).json({ error: 'Failed to load menu' });
    }
});

/**
 * GET /api/allergens
 * Purely returns the list of 14 mandatory allergens
 */
router.get('/allergens', async (req, res) => {
    try {
        const allergens = await prisma.allergen.findMany();
        res.json({ success: true, allergens });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load allergens' });
    }
});

/**
 * PATCH /api/menu/:id/availability
 * Admin endpoint to toggle stop-list for a product
 */
router.patch('/:id/availability', requireRole('ADMIN'), async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        const { isAvailable } = req.body;

        if (isNaN(productId) || typeof isAvailable !== 'boolean') {
            return res.status(400).json({ error: 'Invalid productId or isAvailable' });
        }

        const updatedProduct = await prisma.product.update({
            where: { id: productId },
            data: { isAvailable }
        });

        res.json({ success: true, isAvailable: updatedProduct.isAvailable });
    } catch (err) {
        console.error('[Admin Menu Status Update]', err);
        res.status(500).json({ error: 'Failed to update product availability' });
    }
});

module.exports = router;
