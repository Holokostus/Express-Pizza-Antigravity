// ============================================================
// Express Pizza — DatabaseService (localStorage MVP)
// ============================================================

class DatabaseService {
    constructor() {
        this.MENU_KEY = 'ep_db_menu';
        this.ORDERS_KEY = 'ep_db_orders';
        this.ORDER_SEQ_KEY = 'ep_db_order_seq';

        if (!localStorage.getItem(this.MENU_KEY)) {
            this.seedDatabase();
        }
        if (!localStorage.getItem(this.ORDERS_KEY)) {
            localStorage.setItem(this.ORDERS_KEY, JSON.stringify([]));
        }
        if (!localStorage.getItem(this.ORDER_SEQ_KEY)) {
            localStorage.setItem(this.ORDER_SEQ_KEY, '1000');
        }
    }

    // ---- Menu CRUD ----

    getMenu(category = null) {
        const menu = JSON.parse(localStorage.getItem(this.MENU_KEY)) || [];
        if (category) return menu.filter(i => i.category === category);
        return menu;
    }

    getAvailableMenu(category = null) {
        return this.getMenu(category).filter(i => i.isAvailable !== false);
    }

    getMenuItem(id) {
        return this.getMenu().find(i => i.id === id) || null;
    }

    addMenuItem(item) {
        const menu = this.getMenu();
        const maxId = menu.reduce((max, i) => Math.max(max, i.id), 0);
        item.id = maxId + 1;
        item.isAvailable = item.isAvailable !== false;
        menu.push(item);
        this._saveMenu(menu);
        return item;
    }

    updateMenuItem(id, data) {
        const menu = this.getMenu();
        const idx = menu.findIndex(i => i.id === id);
        if (idx === -1) return null;
        menu[idx] = { ...menu[idx], ...data, id };
        this._saveMenu(menu);
        return menu[idx];
    }

    deleteMenuItem(id) {
        const menu = this.getMenu().filter(i => i.id !== id);
        this._saveMenu(menu);
    }

    toggleAvailability(id) {
        const item = this.getMenuItem(id);
        if (!item) return null;
        return this.updateMenuItem(id, { isAvailable: !item.isAvailable });
    }

    // ---- Orders ----

    addOrder(orderData) {
        const orders = this.getOrders();
        const seq = parseInt(localStorage.getItem(this.ORDER_SEQ_KEY)) || 1000;
        const order = {
            id: seq,
            ...orderData,
            status: 'new',          // new | cooking | delivery | completed
            timestamp: Date.now(),
            completedAt: null
        };
        orders.unshift(order);
        this._saveOrders(orders);
        localStorage.setItem(this.ORDER_SEQ_KEY, String(seq + 1));
        return order;
    }

    getOrders(status = null) {
        const orders = JSON.parse(localStorage.getItem(this.ORDERS_KEY)) || [];
        if (status) return orders.filter(o => o.status === status);
        return orders;
    }

    getOrder(id) {
        return this.getOrders().find(o => o.id === id) || null;
    }

    updateOrderStatus(id, status) {
        const orders = this.getOrders();
        const idx = orders.findIndex(o => o.id === id);
        if (idx === -1) return null;
        orders[idx].status = status;
        if (status === 'completed') orders[idx].completedAt = Date.now();
        this._saveOrders(orders);
        return orders[idx];
    }

    getTodayStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTs = today.getTime();

        const orders = this.getOrders().filter(o => o.timestamp >= todayTs);
        const revenue = orders.reduce((sum, o) => {
            return sum + o.items.reduce((s, i) => s + i.price * i.quantity, 0);
        }, 0);
        const stopListCount = this.getMenu().filter(i => !i.isAvailable).length;

        return {
            ordersToday: orders.length,
            revenue: revenue.toFixed(2),
            stopListCount,
            newOrders: orders.filter(o => o.status === 'new').length
        };
    }

    // ---- Private ----

    _saveMenu(menu) {
        localStorage.setItem(this.MENU_KEY, JSON.stringify(menu));
    }

    _saveOrders(orders) {
        localStorage.setItem(this.ORDERS_KEY, JSON.stringify(orders));
    }

    // ---- Seed ----

    seedDatabase() {
        const menu = [
            // === ПИЦЦА ===
            { id: 1, name: 'Пепперони', category: 'pizza', image: 'images/pepperoni.png', badge: { text: 'Хит', color: 'bg-primary text-white' }, description: 'Классическая пицца с пикантной колбасой пепперони и сыром моцарелла.', isAvailable: true, sizes: [{ label: '30 см', weight: '540г', price: 18.90 }, { label: '36 см', weight: '720г', price: 25.90 }, { label: '60 см', weight: '1400г', price: 42.90 }] },
            { id: 2, name: 'Маргарита', category: 'pizza', image: 'images/margherita.png', badge: { text: '-50%', color: 'bg-accent text-black' }, description: 'Традиционный вкус: томатный соус, свежая моцарелла и базилик.', isAvailable: true, sizes: [{ label: '30 см', weight: '510г', price: 16.50 }, { label: '36 см', weight: '680г', price: 23.50 }, { label: '60 см', weight: '1350г', price: 39.90 }] },
            { id: 3, name: 'Панская', category: 'pizza', image: 'images/pepperoni.png', badge: { text: 'Хит', color: 'bg-primary text-white' }, description: 'Фирменная пицца с ветчиной, грибами, луком и фирменным соусом.', isAvailable: true, sizes: [{ label: '30 см', weight: '560г', price: 19.90 }, { label: '36 см', weight: '750г', price: 27.90 }, { label: '60 см', weight: '1500г', price: 46.90 }] },
            { id: 4, name: 'Диаволо (острая)', category: 'pizza', image: 'images/margherita.png', badge: { text: '🔥 Острое', color: 'bg-orange-500 text-white' }, description: 'Жгучая пицца с салями, перцем чили, халапеньо и острым соусом.', isAvailable: true, sizes: [{ label: '30 см', weight: '530г', price: 20.50 }, { label: '36 см', weight: '710г', price: 28.50 }, { label: '60 см', weight: '1420г', price: 48.90 }] },
            { id: 5, name: 'Бургер пицца', category: 'pizza', image: 'images/pepperoni.png', badge: null, description: 'Сочная говядина, маринованные огурцы, красный лук и соус бургер.', isAvailable: true, sizes: [{ label: '30 см', weight: '580г', price: 21.90 }, { label: '36 см', weight: '780г', price: 29.90 }, { label: '60 см', weight: '1550г', price: 49.90 }] },
            { id: 6, name: 'Четыре сыра', category: 'pizza', image: 'images/margherita.png', badge: null, description: 'Моцарелла, дор-блю, пармезан и чеддер — рай для сырных гурманов.', isAvailable: true, sizes: [{ label: '30 см', weight: '520г', price: 22.50 }, { label: '36 см', weight: '700г', price: 30.50 }, { label: '60 см', weight: '1380г', price: 52.90 }] },
            { id: 7, name: 'Гавайская', category: 'pizza', image: 'images/pepperoni.png', badge: null, description: 'Ветчина, ананасы и моцарелла — сладко-солёная классика.', isAvailable: true, sizes: [{ label: '30 см', weight: '550г', price: 19.50 }, { label: '36 см', weight: '730г', price: 26.90 }, { label: '60 см', weight: '1450г', price: 44.90 }] },

            // === Сет ===
            { id: 10, name: 'Сет «Для своих»', category: 'pizza', image: 'images/margherita.png', badge: { text: 'Сет', color: 'bg-violet-600 text-white' }, description: '7 пицц 30 см на большую компанию! Пепперони, Маргарита, Панская, Диаволо, Бургер, Ветчина, Сырная.', isAvailable: true, sizes: [{ label: '7 пицц', weight: '4200г', price: 99.90 }] },

            // === ПИЦЦА TOGO ===
            { id: 20, name: 'TOGO Ветчина', category: 'togo', image: 'images/pepperoni.png', badge: null, description: 'Удобный формат с собой: ветчина, сыр и фирменный соус.', isAvailable: true, sizes: [{ label: '22 см', weight: '350г', price: 12.00 }] },
            { id: 21, name: 'TOGO Пепперони', category: 'togo', image: 'images/margherita.png', badge: null, description: 'Маленькая пицца с пепперони — идеально для перекуса.', isAvailable: true, sizes: [{ label: '22 см', weight: '340г', price: 11.50 }] },
            { id: 22, name: 'TOGO Маргарита', category: 'togo', image: 'images/pepperoni.png', badge: null, description: 'Классическая маргарита в удобном формате.', isAvailable: true, sizes: [{ label: '22 см', weight: '330г', price: 10.90 }] },

            // === СОУСЫ ===
            { id: 30, name: 'Соус Чесночный', category: 'sauce', image: 'https://images.unsplash.com/photo-1574071318508-1cdbad80ad38?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Классический чесночный соус для корочек.', isAvailable: true, sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }] },
            { id: 31, name: 'Соус Барбекю', category: 'sauce', image: 'https://images.unsplash.com/photo-1574071318508-1cdbad80ad38?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Копчёный и сладковатый — идеален к бортикам.', isAvailable: true, sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }] },
            { id: 32, name: 'Соус Сырный', category: 'sauce', image: 'https://images.unsplash.com/photo-1574071318508-1cdbad80ad38?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Нежный сырный соус для пиццы и снэков.', isAvailable: true, sizes: [{ label: '40 мл', weight: '40г', price: 1.50 }] },

            // === СОКИ ===
            { id: 40, name: 'Rich Яблочный', category: 'juice', image: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Натуральный яблочный сок Rich.', isAvailable: true, sizes: [{ label: '1 л', weight: '1л', price: 3.50 }] },
            { id: 41, name: 'Rich Апельсиновый', category: 'juice', image: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Сочный апельсиновый сок Rich с мякотью.', isAvailable: true, sizes: [{ label: '1 л', weight: '1л', price: 3.90 }] },
            { id: 42, name: 'Rich Мультифрукт', category: 'juice', image: 'https://images.unsplash.com/photo-1567306226416-28f0efdc88ce?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Мультифруктовый нектар Rich.', isAvailable: true, sizes: [{ label: '1 л', weight: '1л', price: 3.90 }] },

            // === НАПИТКИ ===
            { id: 50, name: 'Coca-Cola', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Классический газированный напиток.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 2.80 }, { label: '1 л', weight: '1л', price: 4.50 }] },
            { id: 51, name: 'Fanta', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Газированный напиток со вкусом апельсина.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 2.80 }, { label: '1 л', weight: '1л', price: 4.50 }] },
            { id: 52, name: 'Sprite', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Освежающий лимонно-лаймовый напиток.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 2.80 }, { label: '1 л', weight: '1л', price: 4.50 }] },
            { id: 53, name: 'Вода Bonaqua', category: 'drinks', image: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200', badge: null, description: 'Чистая питьевая вода без газа.', isAvailable: true, sizes: [{ label: '0.5 л', weight: '0.5л', price: 1.90 }] },
        ];

        this._saveMenu(menu);
    }
}

// Global singleton
const db = new DatabaseService();
