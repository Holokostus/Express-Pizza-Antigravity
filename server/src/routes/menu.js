const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { category } = req.query;
        const where = { isAvailable: true };

        if (category) {
            const cat = await prisma.category.findUnique({ where: { slug: category } });
            if (cat) {
                where.categoryId = cat.id;
            }
        }

        const products = await prisma.product.findMany({
            where,
            include: {
                sizes: { orderBy: { price: 'asc' } },
                category: true,
                modifiers: true,
            },
            orderBy: { sortOrder: 'asc' },
        });

        res.json(products);
    } catch (err) {
        console.error('[Menu API] Failed to load menu:', err);
        res.status(500).json({ error: 'Ошибка загрузки меню' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, description = '', price, categorySlug, image = '', weight = 'станд.', category } = req.body;
        const normalizedCategorySlug = categorySlug || category;

        if (!name || Number.isNaN(Number(price)) || !normalizedCategorySlug) {
            return res.status(400).json({ error: 'name, price и categorySlug обязательны' });
        }

        const existingCategory = await prisma.category.findUnique({
            where: { slug: normalizedCategorySlug },
        });

        if (!existingCategory) {
            return res.status(400).json({ error: 'Категория не найдена' });
        }

        const createdProduct = await prisma.product.create({
            data: {
                name,
                description,
                image,
                categoryId: existingCategory.id,
                sizes: {
                    create: {
                        label: 'Стандарт',
                        price: Number(price),
                        weight,
                    },
                },
            },
            include: {
                sizes: true,
                category: true,
            },
        });

        res.status(201).json(createdProduct);
    } catch (err) {
        console.error('[Menu API] Failed to create product:', err);
        res.status(500).json({ error: 'Ошибка создания товара' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { name, description = '', price, categorySlug, image = '', weight = 'станд.', category } = req.body;
        const normalizedCategorySlug = categorySlug || category;

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Некорректный id' });
        }

        if (!name || Number.isNaN(Number(price)) || !normalizedCategorySlug) {
            return res.status(400).json({ error: 'name, price и categorySlug обязательны' });
        }

        const existingCategory = await prisma.category.findUnique({
            where: { slug: normalizedCategorySlug },
        });

        if (!existingCategory) {
            return res.status(400).json({ error: 'Категория не найдена' });
        }

        const updatedProduct = await prisma.product.update({
            where: { id },
            data: {
                name,
                description,
                image,
                categoryId: existingCategory.id,
                sizes: {
                    deleteMany: {},
                    create: {
                        label: 'Стандарт',
                        price: Number(price),
                        weight,
                    },
                },
            },
            include: {
                sizes: true,
                category: true,
            },
        });

        res.json(updatedProduct);
    } catch (err) {
        console.error('[Menu API] Failed to update product:', err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        res.status(500).json({ error: 'Ошибка обновления товара' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Некорректный id' });
        }

        await prisma.product.delete({ where: { id } });
        res.json({ success: true });
    } catch (err) {
        console.error('[Menu API] Failed to delete product:', err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: 'Товар не найден' });
        }
        res.status(500).json({ error: 'Ошибка удаления товара' });
    }
});

module.exports = router;
