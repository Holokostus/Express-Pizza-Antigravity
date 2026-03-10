// ============================================================
// Express Pizza — Menu Scraper & Seeder v3
// ============================================================
// Generates the full Express Pizza Minsk menu (50+ items)
// with Pollinations.ai auto-generated food photos.
// 
// Usage: node server/scripts/scrape-menu.js
// Safe to re-run (uses Prisma upsert).
// ============================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── Pollinations.ai image generator ──
function foodImg(englishName) {
    const prompt = encodeURIComponent(`Delicious professional food photography of ${englishName}, top-down view, restaurant menu style, warm lighting, clean white plate`);
    return `https://image.pollinations.ai/prompt/${prompt}?width=800&height=600&nologo=true`;
}

// ============================================================
// FULL MENU DATA — based on real Express Pizza Minsk
// ============================================================

const CATEGORIES = [
    { slug: 'pizza', name: 'Пицца', sortOrder: 1 },
    { slug: 'togo', name: 'Пицца TOGO', sortOrder: 2 },
    { slug: 'combo', name: 'Комбо & Акции', sortOrder: 3 },
    { slug: 'snacks', name: 'Закуски', sortOrder: 4 },
    { slug: 'desserts', name: 'Десерты', sortOrder: 5 },
    { slug: 'drinks', name: 'Напитки', sortOrder: 6 },
    { slug: 'sauce', name: 'Соусы', sortOrder: 7 },
];

const PRODUCTS = [
    // ═══════════════════════  ПИЦЦА  ═══════════════════════
    {
        name: 'Пепперони', categorySlug: 'pizza', sortOrder: 1,
        description: 'Пикантная пепперони, моцарелла, фирменный томатный соус',
        image: foodImg('pepperoni pizza with mozzarella'),
        calories: 257, proteins: 11, fats: 10, carbs: 30,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '400г', price: 14.90 },
            { label: '30 см', weight: '550г', price: 19.90 },
            { label: '36 см', weight: '750г', price: 24.90 },
        ],
    },
    {
        name: 'Маргарита', categorySlug: 'pizza', sortOrder: 2,
        description: 'Моцарелла, томатный соус, свежий базилик, оливковое масло',
        image: foodImg('margherita pizza with fresh basil'),
        calories: 230, proteins: 9, fats: 8, carbs: 28,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '380г', price: 12.90 },
            { label: '30 см', weight: '520г', price: 17.90 },
            { label: '36 см', weight: '700г', price: 22.90 },
        ],
    },
    {
        name: '4 Сыра', categorySlug: 'pizza', sortOrder: 3,
        description: 'Моцарелла, дор-блю, пармезан, чеддер, сливочный соус',
        image: foodImg('four cheese pizza quattro formaggi'),
        calories: 290, proteins: 13, fats: 14, carbs: 26,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '420г', price: 16.90 },
            { label: '30 см', weight: '580г', price: 22.90 },
            { label: '36 см', weight: '780г', price: 28.90 },
        ],
    },
    {
        name: 'Гавайская', categorySlug: 'pizza', sortOrder: 4,
        description: 'Куриное филе, ананасы, моцарелла, томатный соус',
        image: foodImg('hawaiian pizza with pineapple and chicken'),
        calories: 245, proteins: 12, fats: 9, carbs: 29,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '430г', price: 15.90 },
            { label: '30 см', weight: '580г', price: 20.90 },
            { label: '36 см', weight: '770г', price: 25.90 },
        ],
    },
    {
        name: 'BBQ Курица', categorySlug: 'pizza', sortOrder: 5,
        description: 'Куриное филе, соус BBQ, красный лук, моцарелла, перец',
        image: foodImg('BBQ chicken pizza with red onion'),
        calories: 265, proteins: 14, fats: 11, carbs: 27,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '440г', price: 16.90 },
            { label: '30 см', weight: '600г', price: 21.90 },
            { label: '36 см', weight: '800г', price: 26.90 },
        ],
    },
    {
        name: 'Мясная', categorySlug: 'pizza', sortOrder: 6,
        description: 'Бекон, ветчина, пепперони, фарш, моцарелла, томатный соус',
        image: foodImg('meat lovers pizza with bacon and ham'),
        calories: 310, proteins: 16, fats: 15, carbs: 28,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '480г', price: 17.90 },
            { label: '30 см', weight: '650г', price: 23.90 },
            { label: '36 см', weight: '850г', price: 29.90 },
        ],
    },
    {
        name: 'Карбонара', categorySlug: 'pizza', sortOrder: 7,
        description: 'Бекон, пармезан, яйцо, моцарелла, сливочный соус, чёрный перец',
        image: foodImg('carbonara pizza with bacon and egg'),
        calories: 280, proteins: 13, fats: 13, carbs: 27,
        allergenSlugs: ['gluten', 'dairy', 'eggs'],
        sizes: [
            { label: '25 см', weight: '430г', price: 16.90 },
            { label: '30 см', weight: '590г', price: 21.90 },
            { label: '36 см', weight: '790г', price: 27.90 },
        ],
    },
    {
        name: 'Панская', categorySlug: 'pizza', sortOrder: 8,
        description: 'Охотничьи колбаски, бекон, маринованные огурцы, лук, моцарелла, горчичный соус',
        image: foodImg('Eastern European pizza with sausage and pickles'),
        calories: 295, proteins: 14, fats: 14, carbs: 26,
        allergenSlugs: ['gluten', 'dairy', 'mustard'],
        sizes: [
            { label: '25 см', weight: '460г', price: 17.90 },
            { label: '30 см', weight: '630г', price: 23.90 },
            { label: '36 см', weight: '830г', price: 29.90 },
        ],
    },
    {
        name: 'Грибная', categorySlug: 'pizza', sortOrder: 9,
        description: 'Шампиньоны, белые грибы, моцарелла, трюфельное масло, сливочный соус',
        image: foodImg('mushroom pizza with truffle oil'),
        calories: 235, proteins: 10, fats: 9, carbs: 29,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '400г', price: 15.90 },
            { label: '30 см', weight: '560г', price: 20.90 },
            { label: '36 см', weight: '740г', price: 25.90 },
        ],
    },
    {
        name: 'Цезарь', categorySlug: 'pizza', sortOrder: 10,
        description: 'Куриное филе, салат айсберг, пармезан, черри, соус цезарь',
        image: foodImg('caesar pizza with chicken and parmesan'),
        calories: 250, proteins: 13, fats: 10, carbs: 28,
        allergenSlugs: ['gluten', 'dairy', 'eggs'],
        sizes: [
            { label: '25 см', weight: '440г', price: 16.90 },
            { label: '30 см', weight: '600г', price: 21.90 },
            { label: '36 см', weight: '790г', price: 27.90 },
        ],
    },
    {
        name: 'Дьябло', categorySlug: 'pizza', sortOrder: 11,
        description: 'Острая пепперони, халапеньо, перец чили, моцарелла, томатный соус',
        image: foodImg('spicy diavola pizza with jalapeno and chili'),
        calories: 270, proteins: 12, fats: 12, carbs: 28,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '420г', price: 15.90 },
            { label: '30 см', weight: '580г', price: 20.90 },
            { label: '36 см', weight: '770г', price: 26.90 },
        ],
    },
    {
        name: 'Бекон-Чеддер', categorySlug: 'pizza', sortOrder: 12,
        description: 'Хрустящий бекон, чеддер, моцарелла, карамелизированный лук, соус ранч',
        image: foodImg('bacon cheddar pizza with caramelized onion'),
        calories: 305, proteins: 15, fats: 15, carbs: 27,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '450г', price: 17.90 },
            { label: '30 см', weight: '620г', price: 22.90 },
            { label: '36 см', weight: '820г', price: 28.90 },
        ],
    },
    {
        name: 'Морская', categorySlug: 'pizza', sortOrder: 13,
        description: 'Креветки, мидии, кальмар, моцарелла, чеснок, сливочный соус',
        image: foodImg('seafood pizza with shrimp and mussels'),
        calories: 240, proteins: 14, fats: 9, carbs: 27,
        allergenSlugs: ['gluten', 'dairy', 'crustaceans', 'molluscs'],
        sizes: [
            { label: '25 см', weight: '430г', price: 19.90 },
            { label: '30 см', weight: '590г', price: 25.90 },
            { label: '36 см', weight: '780г', price: 32.90 },
        ],
    },
    {
        name: 'Вегетарианская', categorySlug: 'pizza', sortOrder: 14,
        description: 'Болгарский перец, грибы, оливки, кукуруза, томаты, моцарелла',
        image: foodImg('vegetarian pizza with bell peppers and olives'),
        calories: 210, proteins: 8, fats: 7, carbs: 30,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [
            { label: '25 см', weight: '400г', price: 13.90 },
            { label: '30 см', weight: '550г', price: 18.90 },
            { label: '36 см', weight: '730г', price: 23.90 },
        ],
    },

    // ═══════════════════════  ПИЦЦА TOGO  ═══════════════════════
    {
        name: 'Пепперони Кусочек', categorySlug: 'togo', sortOrder: 1,
        description: 'Кусочек фирменной пепперони на вынос — быстро и вкусно!',
        image: foodImg('single slice of pepperoni pizza in paper box'),
        calories: 260, proteins: 11, fats: 10, carbs: 30,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [{ label: '1 кусок', weight: '150г', price: 4.90 }],
    },
    {
        name: 'Маргарита Кусочек', categorySlug: 'togo', sortOrder: 2,
        description: 'Классическая маргарита — один кусочек с собой',
        image: foodImg('single slice of margherita pizza takeaway'),
        calories: 230, proteins: 9, fats: 8, carbs: 28,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [{ label: '1 кусок', weight: '140г', price: 3.90 }],
    },
    {
        name: 'Мясная Кусочек', categorySlug: 'togo', sortOrder: 3,
        description: 'Мощный кусочек мясной пиццы с беконом и пепперони',
        image: foodImg('single slice of meat pizza takeaway'),
        calories: 310, proteins: 16, fats: 15, carbs: 28,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [{ label: '1 кусок', weight: '170г', price: 5.50 }],
    },

    // ═══════════════════════  КОМБО  ═══════════════════════
    {
        name: 'Комбо Family Pack', categorySlug: 'combo', sortOrder: 1,
        description: '2 большие пиццы 36 см + 2 соуса + Coca-Cola 1л. Экономия 25%!',
        image: foodImg('family combo deal two large pizzas with drinks'),
        badge: { text: '-25%', color: 'bg-green-500 text-white' },
        calories: 310, proteins: 13, fats: 13, carbs: 30,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [{ label: 'Набор', weight: '~2.5 кг', price: 49.90 }],
    },
    {
        name: 'Комбо Student Lunch', categorySlug: 'combo', sortOrder: 2,
        description: 'Пицца кусочек + соус + напиток 0.5л. Идеально для обеда!',
        image: foodImg('student lunch combo pizza slice with drink'),
        badge: { text: 'Хит', color: 'bg-primary text-white' },
        calories: 280, proteins: 11, fats: 10, carbs: 28,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [{ label: 'Набор', weight: '~500г', price: 9.90 }],
    },
    {
        name: 'Комбо Date Night', categorySlug: 'combo', sortOrder: 3,
        description: '2 пиццы 30 см + 2 соуса + 2 сока. Романтический ужин!',
        image: foodImg('romantic dinner combo two pizzas candle light'),
        badge: { text: 'Для двоих', color: 'bg-pink-500 text-white' },
        calories: 295, proteins: 12, fats: 12, carbs: 27,
        allergenSlugs: ['gluten', 'dairy'],
        sizes: [{ label: 'Набор', weight: '~1.8 кг', price: 39.90 }],
    },

    // ═══════════════════════  ЗАКУСКИ  ═══════════════════════
    {
        name: 'Картошка фри', categorySlug: 'snacks', sortOrder: 1,
        description: 'Хрустящая золотистая картошка фри с морской солью',
        image: foodImg('crispy golden french fries with sea salt'),
        calories: 312, proteins: 3.4, fats: 15, carbs: 41,
        allergenSlugs: [],
        sizes: [
            { label: 'Стандарт', weight: '150г', price: 5.90 },
            { label: 'Большая', weight: '250г', price: 8.90 },
        ],
    },
    {
        name: 'Куриные наггетсы', categorySlug: 'snacks', sortOrder: 2,
        description: '9 хрустящих наггетсов из куриного филе + соус на выбор',
        image: foodImg('crispy chicken nuggets with dipping sauce'),
        calories: 296, proteins: 15, fats: 18, carbs: 19,
        allergenSlugs: ['gluten', 'eggs'],
        sizes: [
            { label: '6 шт', weight: '180г', price: 7.90 },
            { label: '9 шт', weight: '270г', price: 10.90 },
        ],
    },
    {
        name: 'Сырные палочки', categorySlug: 'snacks', sortOrder: 3,
        description: 'Моцарелла в хрустящей панировке с маринара-соусом',
        image: foodImg('mozzarella cheese sticks with marinara sauce'),
        calories: 320, proteins: 12, fats: 20, carbs: 24,
        allergenSlugs: ['gluten', 'dairy', 'eggs'],
        sizes: [{ label: '6 шт', weight: '200г', price: 8.90 }],
    },
    {
        name: 'Куриные крылышки', categorySlug: 'snacks', sortOrder: 4,
        description: 'Крылышки в соусе на выбор: BBQ, острый или чесночный',
        image: foodImg('crispy chicken wings with BBQ sauce'),
        calories: 280, proteins: 22, fats: 18, carbs: 8,
        allergenSlugs: [],
        sizes: [
            { label: '6 шт', weight: '300г', price: 9.90 },
            { label: '12 шт', weight: '600г', price: 17.90 },
        ],
    },
    {
        name: 'Луковые кольца', categorySlug: 'snacks', sortOrder: 5,
        description: 'Хрустящие кольца лука в пивном кляре с соусом ранч',
        image: foodImg('crispy onion rings with ranch dip'),
        calories: 330, proteins: 4, fats: 16, carbs: 42,
        allergenSlugs: ['gluten'],
        sizes: [{ label: '8 шт', weight: '200г', price: 6.90 }],
    },

    // ═══════════════════════  ДЕСЕРТЫ  ═══════════════════════
    {
        name: 'Чизкейк Нью-Йорк', categorySlug: 'desserts', sortOrder: 1,
        description: 'Классический сливочный чизкейк с ягодным соусом',
        image: foodImg('New York cheesecake with berry sauce'),
        calories: 320, proteins: 6, fats: 22, carbs: 28,
        allergenSlugs: ['gluten', 'dairy', 'eggs'],
        sizes: [{ label: '1 порция', weight: '150г', price: 8.90 }],
    },
    {
        name: 'Тирамису', categorySlug: 'desserts', sortOrder: 2,
        description: 'Итальянский десерт с маскарпоне, кофе и какао',
        image: foodImg('tiramisu Italian dessert with cocoa powder'),
        calories: 290, proteins: 5, fats: 18, carbs: 30,
        allergenSlugs: ['gluten', 'dairy', 'eggs'],
        sizes: [{ label: '1 порция', weight: '160г', price: 9.90 }],
    },
    {
        name: 'Синнабон', categorySlug: 'desserts', sortOrder: 3,
        description: 'Тёплая булочка с корицей, глазурью и орехами пекан',
        image: foodImg('cinnamon roll with icing and pecans'),
        calories: 380, proteins: 5, fats: 17, carbs: 52,
        allergenSlugs: ['gluten', 'dairy', 'eggs', 'nuts'],
        sizes: [{ label: '1 шт', weight: '180г', price: 6.90 }],
    },

    // ═══════════════════════  НАПИТКИ  ═══════════════════════
    {
        name: 'Coca-Cola', categorySlug: 'drinks', sortOrder: 1,
        description: 'Классическая Coca-Cola',
        image: foodImg('coca cola glass bottle cold drink'),
        calories: 42, proteins: 0, fats: 0, carbs: 10.6,
        allergenSlugs: [],
        sizes: [
            { label: '0.5 л', weight: '500мл', price: 3.50 },
            { label: '1 л', weight: '1000мл', price: 5.90 },
        ],
    },
    {
        name: 'Fanta', categorySlug: 'drinks', sortOrder: 2,
        description: 'Апельсиновый газированный напиток',
        image: foodImg('fanta orange soda cold drink'),
        calories: 48, proteins: 0, fats: 0, carbs: 12,
        allergenSlugs: [],
        sizes: [{ label: '0.5 л', weight: '500мл', price: 3.50 }],
    },
    {
        name: 'Sprite', categorySlug: 'drinks', sortOrder: 3,
        description: 'Лимонно-лаймовый газированный напиток',
        image: foodImg('sprite lemon lime soda cold drink'),
        calories: 40, proteins: 0, fats: 0, carbs: 10,
        allergenSlugs: [],
        sizes: [{ label: '0.5 л', weight: '500мл', price: 3.50 }],
    },
    {
        name: 'Квас Лидский', categorySlug: 'drinks', sortOrder: 4,
        description: 'Настоящий белорусский квас — Лидское пиво',
        image: foodImg('traditional Belarusian kvass bread drink in glass'),
        calories: 32, proteins: 0.2, fats: 0, carbs: 7.5,
        allergenSlugs: ['gluten'],
        sizes: [{ label: '0.5 л', weight: '500мл', price: 3.90 }],
    },
    {
        name: 'Морс клюквенный', categorySlug: 'drinks', sortOrder: 5,
        description: 'Домашний клюквенный морс — кислинка и витамины',
        image: foodImg('cranberry juice mors homemade in glass'),
        calories: 46, proteins: 0, fats: 0, carbs: 11,
        allergenSlugs: [],
        sizes: [{ label: '0.4 л', weight: '400мл', price: 4.50 }],
    },
    {
        name: 'Яблочный сок', categorySlug: 'drinks', sortOrder: 6,
        description: 'Натуральный яблочный сок',
        image: foodImg('fresh apple juice in glass'),
        calories: 46, proteins: 0.1, fats: 0, carbs: 11,
        allergenSlugs: [],
        sizes: [{ label: '0.3 л', weight: '300мл', price: 3.90 }],
    },
    {
        name: 'Апельсиновый сок', categorySlug: 'drinks', sortOrder: 7,
        description: 'Натуральный апельсиновый сок',
        image: foodImg('fresh orange juice in glass'),
        calories: 45, proteins: 0.7, fats: 0, carbs: 10.4,
        allergenSlugs: [],
        sizes: [{ label: '0.3 л', weight: '300мл', price: 3.90 }],
    },
    {
        name: 'Вода', categorySlug: 'drinks', sortOrder: 8,
        description: 'Минеральная вода (газ / без газа)',
        image: foodImg('mineral water bottle clean and cold'),
        calories: 0, proteins: 0, fats: 0, carbs: 0,
        allergenSlugs: [],
        sizes: [{ label: '0.5 л', weight: '500мл', price: 2.50 }],
    },

    // ═══════════════════════  СОУСЫ  ═══════════════════════
    {
        name: 'Чесночный соус', categorySlug: 'sauce', sortOrder: 1,
        description: 'Сливочно-чесночный соус',
        image: foodImg('creamy garlic dipping sauce in small bowl'),
        calories: 180, proteins: 1, fats: 18, carbs: 3,
        allergenSlugs: ['dairy'],
        sizes: [{ label: '40 мл', weight: '40мл', price: 1.50 }],
    },
    {
        name: 'Сырный соус', categorySlug: 'sauce', sortOrder: 2,
        description: 'Густой сырный соус',
        image: foodImg('cheese dipping sauce golden in small bowl'),
        calories: 200, proteins: 4, fats: 18, carbs: 5,
        allergenSlugs: ['dairy'],
        sizes: [{ label: '40 мл', weight: '40мл', price: 1.50 }],
    },
    {
        name: 'Соус BBQ', categorySlug: 'sauce', sortOrder: 3,
        description: 'Классический соус барбекю — сладко-копчёный',
        image: foodImg('BBQ barbecue sauce in small bowl'),
        calories: 110, proteins: 0.5, fats: 0, carbs: 26,
        allergenSlugs: [],
        sizes: [{ label: '40 мл', weight: '40мл', price: 1.50 }],
    },
    {
        name: 'Кисло-сладкий соус', categorySlug: 'sauce', sortOrder: 4,
        description: 'Азиатский кисло-сладкий соус с имбирём',
        image: foodImg('sweet and sour Asian dipping sauce'),
        calories: 120, proteins: 0.3, fats: 0, carbs: 30,
        allergenSlugs: ['soybeans'],
        sizes: [{ label: '40 мл', weight: '40мл', price: 1.50 }],
    },
    {
        name: 'Острый соус', categorySlug: 'sauce', sortOrder: 5,
        description: 'Жгучий чили-соус Шрирача',
        image: foodImg('hot sriracha chili sauce in small bowl'),
        calories: 90, proteins: 1, fats: 1, carbs: 18,
        allergenSlugs: [],
        sizes: [{ label: '40 мл', weight: '40мл', price: 1.50 }],
    },
    {
        name: 'Томатный соус', categorySlug: 'sauce', sortOrder: 6,
        description: 'Классический томатный соус с базиликом',
        image: foodImg('tomato marinara sauce with basil'),
        calories: 50, proteins: 1, fats: 0.5, carbs: 10,
        allergenSlugs: [],
        sizes: [{ label: '40 мл', weight: '40мл', price: 1.00 }],
    },
];

// ═══════════════════════  MODIFIERS (for pizzas)  ═══════════════════════
const MODIFIERS = [
    { name: 'Сырный бортик', price: 4.00, groupName: 'Бортик', isRemoval: false, isMandatory: false, maxQuantity: 1, kdsHighlight: true },
    { name: 'Двойной сыр', price: 3.00, groupName: 'Допы', isRemoval: false, isMandatory: false, maxQuantity: 1, kdsHighlight: true },
    { name: 'Халапеньо', price: 1.50, groupName: 'Допы', isRemoval: false, isMandatory: false, maxQuantity: 1, kdsHighlight: false },
    { name: 'Дополнительная моцарелла', price: 2.50, groupName: 'Допы', isRemoval: false, isMandatory: false, maxQuantity: 1, kdsHighlight: false },
    { name: 'Бекон', price: 3.00, groupName: 'Допы', isRemoval: false, isMandatory: false, maxQuantity: 1, kdsHighlight: true },
    { name: 'Без лука', price: 0.00, groupName: 'Убрать', isRemoval: true, isMandatory: false, maxQuantity: 1, kdsHighlight: true },
    { name: 'Без грибов', price: 0.00, groupName: 'Убрать', isRemoval: true, isMandatory: false, maxQuantity: 1, kdsHighlight: true },
    { name: 'Без оливок', price: 0.00, groupName: 'Убрать', isRemoval: true, isMandatory: false, maxQuantity: 1, kdsHighlight: true },
];

// ============================================================
// SEED LOGIC
// ============================================================
async function main() {
    console.log('🌱 Express Pizza Menu Seeder v3\n');
    console.log('══════════════════════════════════════════');

    // ── 0. Clean Test Orders (Fix for Foreign Key Constraint) ──
    console.log('Cleaning up old test orders...');
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();

    // ── 1. Categories ──
    const catMap = {};
    for (const c of CATEGORIES) {
        const cat = await prisma.category.upsert({
            where: { slug: c.slug },
            update: { name: c.name, sortOrder: c.sortOrder },
            create: c,
        });
        catMap[c.slug] = cat.id;
    }
    console.log(`✓ Categories: ${CATEGORIES.length}`);

    // ── 2. Allergens (ensure they exist) ──
    const allergenSlugs = [...new Set(PRODUCTS.flatMap(p => p.allergenSlugs || []))];
    const existingAllergens = await prisma.allergen.findMany();
    const existingSlugs = new Set(existingAllergens.map(a => a.slug));
    for (const slug of allergenSlugs) {
        if (!existingSlugs.has(slug)) {
            await prisma.allergen.create({ data: { slug, nameRu: slug, nameEn: slug, icon: '⚠️' } });
        }
    }
    console.log(`✓ Allergens verified`);

    // ── 3. Products ──
    let created = 0, updated = 0;
    for (const p of PRODUCTS) {
        const categoryId = catMap[p.categorySlug];
        if (!categoryId) { console.warn(`  ⚠ Unknown category: ${p.categorySlug}`); continue; }

        // Check if product already exists
        const existing = await prisma.product.findFirst({ where: { name: p.name } });

        if (existing) {
            // Update existing product
            await prisma.product.update({
                where: { id: existing.id },
                data: {
                    description: p.description,
                    image: p.image,
                    categoryId,
                    sortOrder: p.sortOrder,
                    calories: p.calories, proteins: p.proteins, fats: p.fats, carbs: p.carbs,
                    allergenSlugs: p.allergenSlugs || [],
                    badge: p.badge || null,
                },
            });

            // Sync sizes: delete old + create new
            await prisma.productSize.deleteMany({ where: { productId: existing.id } });
            for (const s of p.sizes) {
                await prisma.productSize.create({
                    data: { productId: existing.id, label: s.label, weight: s.weight, price: s.price },
                });
            }
            updated++;
        } else {
            // Create new product
            const newProd = await prisma.product.create({
                data: {
                    name: p.name,
                    description: p.description,
                    image: p.image,
                    categoryId,
                    sortOrder: p.sortOrder,
                    calories: p.calories, proteins: p.proteins, fats: p.fats, carbs: p.carbs,
                    allergenSlugs: p.allergenSlugs || [],
                    badge: p.badge || null,
                    isAvailable: true,
                },
            });

            for (const s of p.sizes) {
                await prisma.productSize.create({
                    data: { productId: newProd.id, label: s.label, weight: s.weight, price: s.price },
                });
            }
            created++;
        }
    }
    console.log(`✓ Products: ${created} created, ${updated} updated (${PRODUCTS.length} total)`);

    // ── 4. Modifiers (attach to all pizza products) ──
    const pizzaProducts = await prisma.product.findMany({
        where: { categoryId: catMap['pizza'] },
    });

    let modCount = 0;

    // Сначала находим или создаем все модификаторы (без привязки к конкретной пицце)
    for (const mod of MODIFIERS) {
        let existingMod = await prisma.productModifier.findFirst({
            where: { name: mod.name },
        });

        if (!existingMod) {
            existingMod = await prisma.productModifier.create({
                data: mod,
            });
            modCount++;
        }

        // Теперь привязываем этот модификатор ко всем пиццам (связь m-n)
        // Используем синтаксис modifiers: { connect: { id: existingMod.id } }
        for (const pizza of pizzaProducts) {
            await prisma.product.update({
                where: { id: pizza.id },
                data: {
                    modifiers: {
                        connect: { id: existingMod.id }
                    }
                }
            });
        }
    }
    console.log(`✓ Modifiers: ${modCount} new, connected to ${pizzaProducts.length} pizzas`);

    console.log('\n══════════════════════════════════════════');
    console.log('🎉 Menu seeding complete!\n');
}

main()
    .catch(e => { console.error('❌ Seed error:', e); process.exit(1); })
    .finally(() => prisma.$disconnect());
