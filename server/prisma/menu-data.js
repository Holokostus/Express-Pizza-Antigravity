const categories = [
  { slug: 'pizza', name: 'Пицца', sortOrder: 1 },
  { slug: 'togo', name: 'Пицца TOGO (Кальцоне)', sortOrder: 2 },
  { slug: 'combo', name: 'Сеты / Комбо-предложения', sortOrder: 3 },
  { slug: 'sauce', name: 'Соусы', sortOrder: 4 },
  { slug: 'juice', name: 'Соки', sortOrder: 5 },
  { slug: 'drinks', name: 'Напитки', sortOrder: 6 },
];

const promotions = [
  {
    title: 'Скидка 50% на вторую пиццу',
    subtitle:
      'Ежедневно на доставку и самовывоз. Скидка на более дешевую пиццу. Действует для размеров 30 и 36 см. Исключения: Панская, Барбекю мясная, Четыре сезона.',
    badgeText: '-50%',
    bgColor: '#F97316',
    imageUrl: '/images/hero_banner.png',
    linkUrl: '/#menu',
    isActive: true,
  },
];


const defaultPizzaModifiers = [
  { name: 'Сырный бортик', price: 3.5, image: 'https://images.pexels.com/photos/825661/pexels-photo-825661.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { name: 'Халапеньо', price: 1.5, image: 'https://images.pexels.com/photos/1268101/pexels-photo-1268101.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { name: 'Ветчина', price: 2.5, image: 'https://images.pexels.com/photos/1927377/pexels-photo-1927377.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { name: 'Бекон', price: 2.7, image: 'https://images.pexels.com/photos/4113908/pexels-photo-4113908.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  { name: 'Двойной сыр', price: 3.2, image: 'https://images.pexels.com/photos/4109084/pexels-photo-4109084.jpeg?auto=compress&cs=tinysrgb&w=1200' },
];

const products = [
  // Pizza sets / combo
  { name: 'Пикник (выгода 50%)', categorySlug: 'combo', weight: '5×30 см', price: 84, description: 'Маргарита, Аппетитная, Ветчина и грибы, Цыпленок барбекю, Панская.' },
  { name: 'Для друзей (выгода 40%)', categorySlug: 'combo', weight: '4×36 см', price: 89, description: 'Барбекю мясная, Цыпленок ранч, Жульен, Охотничья.' },
  { name: '1+1 Бургер-пепперони', categorySlug: 'combo', weight: '2×30 см', price: 49, description: 'Бургер-пицца + Пепперони.' },
  { name: '1+1 Мясная-охотничья', categorySlug: 'combo', weight: '2×30 см', price: 49, description: 'Мясное удовольствие + Охотничья.' },
  { name: '1+1 Цыпленок-ветчина', categorySlug: 'combo', weight: '2×30 см', price: 49, description: 'Цыпленок барбекю + Ветчина и грибы.' },
  { name: 'Набор чемпиона', categorySlug: 'combo', weight: '3×30 см', price: 65, description: 'Цыпленок барбекю, Дабл пепперони, Бургер-пицца.' },
  { name: 'Трофей победителя', categorySlug: 'combo', weight: '5×30 см', price: 98, description: 'Мясное удовольствие, Ранчо, Ветчина и грибы, Кантри, Цыпленок ранч.' },
  { name: 'Для своих', categorySlug: 'combo', weight: '7×30 см', price: 115, description: 'Барбекю мясная, Гурман, Диаволо, Маргарита, Римская, Четыре мяса, Четыре сезона.' },
  { name: 'Сет чикен', categorySlug: 'combo', weight: '1 кг', price: 41.5, description: 'Сыр, рубленое филе цыпленка, жареные грибы, бекон, соус Ранч, сосиски Хот, чеддер, картофель.' },

  // Pizza TOGO (Calzone)
  { name: 'Кальцоне грудинка с салями', categorySlug: 'togo', image: '/images/calzone.jpg', weight: '300г', price: 16, description: 'Сыр моцарелла, грудинка, салями, сладкий перец и томатный соус в хрустящем тесте.' },
  { name: 'Кальцоне с ветчиной и грибами', categorySlug: 'togo', image: '/images/calzone.jpg', weight: '300г', price: 16, description: 'Сыр моцарелла, ветчина, шампиньоны и сливочный соус.' },
  { name: 'Кальцоне с колбаской по-охотничьи', categorySlug: 'togo', image: '/images/calzone.jpg', weight: '300г', price: 16, description: 'Сыр моцарелла, охотничьи колбаски, маринованный огурчик, томатный соус и лёгкая горчица.' },
  { name: 'Кальцоне с курицей и грибами', categorySlug: 'togo', image: '/images/calzone.jpg', weight: '300г', price: 16, description: 'Рубленое филе цыплёнка, сыр моцарелла, шампиньоны и нежный сливочный соус.' },

  // Drinks
  { name: 'Coca-Cola', categorySlug: 'drinks', image: '/images/cola.jpg', description: 'Освежающий газированный напиток с классическим вкусом колы.', sizes: [ { label: '1.0 л', weight: '1.0л', price: 6.9 }, { label: '0.5 л', weight: '0.5л', price: 4.9 } ] },
  { name: 'Sprite', categorySlug: 'drinks', image: '/images/cola.jpg', description: 'Лимонно-лаймовый газированный напиток без кофеина.', sizes: [ { label: '1.0 л', weight: '1.0л', price: 6.9 }, { label: '0.5 л', weight: '0.5л', price: 4.9 } ] },
  { name: 'Fanta', categorySlug: 'drinks', image: '/images/cola.jpg', description: 'Яркий апельсиновый газированный напиток.', sizes: [ { label: '1.0 л', weight: '1.0л', price: 6.9 }, { label: '0.5 л', weight: '0.5л', price: 4.9 } ] },
  { name: 'Бонаква негазированная', categorySlug: 'drinks', image: '/images/cola.jpg', weight: '0.5л', price: 1.6, description: 'Вода негазированная.' },
  { name: 'Бонаква среднегазированная', categorySlug: 'drinks', image: '/images/cola.jpg', weight: '0.5л', price: 1.6, description: 'Вода среднегазированная.' },
  { name: 'Burn', categorySlug: 'drinks', image: '/images/cola.jpg', weight: '0.25л', price: 0, description: 'Энергетический напиток.' },

  // Juice
  { name: 'Сок Rich апельсин', categorySlug: 'juice', image: '/images/cola.jpg', weight: '1.0л', price: 4.75, description: 'Натуральный фруктовый сок с насыщенным апельсиновым вкусом.' },
  { name: 'Сок Rich томатный', categorySlug: 'juice', image: '/images/cola.jpg', weight: '1.0л', price: 4.75, description: 'Натуральный томатный сок с мягкой текстурой и сбалансированным вкусом.' },
  { name: 'Сок Rich яблочный', categorySlug: 'juice', image: '/images/cola.jpg', weight: '1.0л', price: 4.75, description: 'Натуральный яблочный сок с лёгкой сладостью.' },
  { name: 'Сок Rich мультифрукт', categorySlug: 'juice', image: '/images/cola.jpg', weight: '1.0л', price: 4.75, description: 'Натуральный мультифруктовый сок из смеси спелых фруктов.' },

  // Pizza
  { name: 'Восемь ломтиков', categorySlug: 'pizza', description: '2 кг фирменная пицца.', sizes: [{ label: '60 см', weight: '2кг', price: 98 }] },
  { name: 'Баварская', categorySlug: 'pizza', description: '500 г.', sizes: [{ label: '30 см', weight: '500г', price: 23 }, { label: '36 см', weight: '500г', price: 28 }] },
  { name: 'Бекон и грибы', categorySlug: 'pizza', description: '500 г.', sizes: [{ label: '30 см', weight: '500г', price: 23 }, { label: '36 см', weight: '500г', price: 28 }] },
  { name: 'Ветчина и сыр', categorySlug: 'pizza', description: '500 г.', sizes: [{ label: '30 см', weight: '500г', price: 23 }, { label: '36 см', weight: '500г', price: 28 }] },
  { name: 'Хуторская', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 16.7 }, { label: '30 см', weight: '600г', price: 28.7 }, { label: '36 см', weight: '600г', price: 37 }] },
  { name: 'Чизбургер', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 18.2 }, { label: '30 см', weight: '600г', price: 28.7 }, { label: '36 см', weight: '600г', price: 39.9 }] },
  { name: 'Панская', categorySlug: 'pizza', image: '/images/panskaya.jpg', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 29 }, { label: '36 см', weight: '600г', price: 35 }] },
  { name: 'Аппетитная', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 29.6 }, { label: '36 см', weight: '600г', price: 36 }] },
  { name: 'Ветчина и грибы', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 24 }, { label: '36 см', weight: '600г', price: 34 }] },
  { name: 'Диаволо (острая)', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '36 см', weight: '600г', price: 34 }] },
  { name: 'Канарская', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 29.1 }, { label: '36 см', weight: '600г', price: 37 }] },
  { name: 'Кантри', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 29.1 }, { label: '36 см', weight: '600г', price: 35 }] },
  { name: 'Маргарита', categorySlug: 'pizza', image: '/images/margarita.jpg', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 22.6 }, { label: '36 см', weight: '600г', price: 29 }] },
  { name: 'Пепперони', categorySlug: 'pizza', image: '/images/pepperoni.jpg', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 24.9 }, { label: '36 см', weight: '600г', price: 31 }] },
  { name: 'Жульен', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 30.1 }, { label: '36 см', weight: '600г', price: 39 }] },
  { name: 'Барбекю мясная', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 34.9 }, { label: '36 см', weight: '600г', price: 39.9 }] },
  { name: 'Четыре сезона', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 31.1 }, { label: '36 см', weight: '600г', price: 38 }] },
  { name: 'Цыпленок ранч', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 34 }, { label: '36 см', weight: '600г', price: 37 }] },
  { name: 'Дабл пепперони', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 31.9 }, { label: '36 см', weight: '600г', price: 36 }] },
  { name: 'Мясное удовольствие', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 30.1 }, { label: '36 см', weight: '600г', price: 37 }] },
  { name: 'Охотничья', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 30.1 }, { label: '36 см', weight: '600г', price: 34 }] },
  { name: 'Ранчо', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 30.1 }, { label: '36 см', weight: '600г', price: 37 }] },
  { name: 'Римская', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 30.1 }, { label: '36 см', weight: '600г', price: 37 }] },
  { name: 'Цезарь', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 17.7 }, { label: '30 см', weight: '600г', price: 30.1 }, { label: '36 см', weight: '600г', price: 36 }] },
  { name: 'Сырная', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 18.6 }, { label: '30 см', weight: '600г', price: 33.9 }, { label: '36 см', weight: '600г', price: 37 }] },
  { name: 'Бургер-пицца', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 15.5 }, { label: '30 см', weight: '600г', price: 32.1 }, { label: '36 см', weight: '600г', price: 39.9 }] },
  { name: 'Маринара', categorySlug: 'pizza', description: '600 г.', sizes: [{ label: '23 см', weight: '600г', price: 18.2 }, { label: '30 см', weight: '600г', price: 38 }, { label: '36 см', weight: '600г', price: 43 }] },
];

const productsWithPizzaModifiers = products.map((product) => (
  product.categorySlug === 'pizza'
    ? { ...product, modifiers: product.modifiers || defaultPizzaModifiers }
    : product
));

module.exports = { categories, promotions, products: productsWithPizzaModifiers };
