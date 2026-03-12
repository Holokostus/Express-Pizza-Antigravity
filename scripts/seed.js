const prisma = require('../server/src/lib/prisma');

async function main() {
    console.log('🌱 Starting lightweight seed...');

    await prisma.product.deleteMany();
    await prisma.category.deleteMany();

    const categoryData = [
        { slug: 'pizzas', name: 'Пиццы', sortOrder: 1 },
        { slug: 'snacks', name: 'Закуски', sortOrder: 2 },
        { slug: 'drinks', name: 'Напитки', sortOrder: 3 },
        { slug: 'sauces', name: 'Соусы', sortOrder: 4 },
    ];

    const categories = await Promise.all(
        categoryData.map((category) => prisma.category.create({ data: category }))
    );

    const categoryIdBySlug = categories.reduce((acc, category) => {
        acc[category.slug] = category.id;
        return acc;
    }, {});

    const pizzas = [
        {
            name: 'Пепперони',
            description: 'Томатный соус, моцарелла, пепперони',
            image: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 1,
            categoryId: categoryIdBySlug.pizzas,
            sizes: [
                { label: '30 см', weight: '520г', price: 18.9 },
                { label: '36 см', weight: '760г', price: 25.9 },
            ],
        },
        {
            name: 'Маргарита',
            description: 'Томатный соус, моцарелла, базилик',
            image: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 2,
            categoryId: categoryIdBySlug.pizzas,
            sizes: [
                { label: '30 см', weight: '500г', price: 16.9 },
                { label: '36 см', weight: '730г', price: 23.9 },
            ],
        },
        {
            name: '4 Сыра',
            description: 'Сливочный соус, моцарелла, чеддер, дорблю, пармезан',
            image: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=1200&q=80',
            sortOrder: 3,
            categoryId: categoryIdBySlug.pizzas,
            sizes: [
                { label: '30 см', weight: '540г', price: 20.9 },
                { label: '36 см', weight: '790г', price: 28.9 },
            ],
        },
    ];

    for (const pizza of pizzas) {
        await prisma.product.create({
            data: {
                name: pizza.name,
                description: pizza.description,
                image: pizza.image,
                categoryId: pizza.categoryId,
                sortOrder: pizza.sortOrder,
                sizes: {
                    create: pizza.sizes,
                },
            },
        });
    }

    console.log(`✅ Seed complete: ${categories.length} categories, ${pizzas.length} pizzas`);
}

main()
    .catch((error) => {
        console.error('❌ Seed failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
