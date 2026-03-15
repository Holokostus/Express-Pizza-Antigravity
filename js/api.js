// ============================================================
// Express Pizza — api.js (Module 1/4)
// ============================================================
// Shared API helper, toast notifications, and constants.
// Loaded FIRST via <script> tag. Other modules depend on this.
// ============================================================

const API_BASE = window.location.origin.includes('localhost') ? 'http://localhost:3000/api' : '/api';

// ── State (shared across modules) ──
let appliedPromoCode = null;
let authToken = localStorage.getItem('ep_auth_token') || null;
let cart = [];
try {
    cart = JSON.parse(localStorage.getItem('ep_cart')) || [];
    if (!Array.isArray(cart)) {
        cart = [];
    }
} catch (error) {
    console.warn('[Cart] Corrupted localStorage cart detected, resetting state:', error);
    localStorage.removeItem('ep_cart');
    localStorage.removeItem('cart');
    cart = [];
}
let currentCategory = null;
let selectedSizeIndex = {};
let serverCalculation = null;
let menuItems = [];
let menuCategories = [];
let promotions = [];

const CATEGORY_FALLBACK_IMAGES = {
    pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80&auto=format&fit=crop',
    togo: 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=1200&q=80&auto=format&fit=crop',
    combo: 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=1200&q=80&auto=format&fit=crop',
    sauce: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?w=1200&q=80&auto=format&fit=crop',
    juice: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=1200&q=80&auto=format&fit=crop',
    drinks: 'https://images.unsplash.com/photo-1543253687-c931c8e01820?w=1200&q=80&auto=format&fit=crop',
    deserts: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=1200&q=80&auto=format&fit=crop',
    dessert: 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=1200&q=80&auto=format&fit=crop',
    snacks: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=1200&q=80&auto=format&fit=crop',
};

const PRODUCT_IMAGE_BY_NAME = {
    'coca-cola': 'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=1200&q=80&auto=format&fit=crop',
    'sprite': 'https://images.unsplash.com/photo-1610873167013-2dd675d30ef4?w=1200&q=80&auto=format&fit=crop',
    'fanta': 'https://images.unsplash.com/photo-1624517452488-04869289c4ca?w=1200&q=80&auto=format&fit=crop',
    'burn': 'https://images.unsplash.com/photo-1595981267035-7b04ca84a82d?w=1200&q=80&auto=format&fit=crop',
    'бонаква': 'https://images.unsplash.com/photo-1564419439260-858f4c6740d7?w=1200&q=80&auto=format&fit=crop',
    'rich': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=1200&q=80&auto=format&fit=crop',
    'сок': 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=1200&q=80&auto=format&fit=crop',
    'апельсин': 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=1200&q=80&auto=format&fit=crop',
    'томатный': 'https://images.unsplash.com/photo-1571680322279-a226e6a4cc2a?w=1200&q=80&auto=format&fit=crop',
    'яблочный': 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=1200&q=80&auto=format&fit=crop',
    'мультифрукт': 'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=1200&q=80&auto=format&fit=crop',
    'кальцоне': 'https://images.unsplash.com/photo-1515516969-d4008cc6241a?w=1200&q=80&auto=format&fit=crop',
    'соус': 'https://images.unsplash.com/photo-1598514983318-2f64f8f4796c?w=1200&q=80&auto=format&fit=crop',
    'сет': 'https://images.unsplash.com/photo-1608039755401-742074f0548d?w=1200&q=80&auto=format&fit=crop',
    'пикник': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80&auto=format&fit=crop',
    'пепперони': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80&auto=format&fit=crop',
    'маргарита': 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=1200&q=80&auto=format&fit=crop',
    'цезарь': 'https://images.unsplash.com/photo-1594007654729-407eedc4be65?w=1200&q=80&auto=format&fit=crop',
    'чизбургер': 'https://images.unsplash.com/photo-1541745537411-b8046dc6d66c?w=1200&q=80&auto=format&fit=crop',
    'жульен': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=80&auto=format&fit=crop',
    'барбекю': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80&auto=format&fit=crop',
    'сырная': 'https://images.unsplash.com/photo-1565299507177-b0ac66763828?w=1200&q=80&auto=format&fit=crop',
};

const MODIFIER_IMAGE_BY_NAME = {
    'сырный бортик': 'https://images.pexels.com/photos/825661/pexels-photo-825661.jpeg?auto=compress&cs=tinysrgb&w=800',
    'халапеньо': 'https://images.pexels.com/photos/1268101/pexels-photo-1268101.jpeg?auto=compress&cs=tinysrgb&w=800',
    'ветчина': 'https://images.pexels.com/photos/1927377/pexels-photo-1927377.jpeg?auto=compress&cs=tinysrgb&w=800',
    'бекон': 'https://images.pexels.com/photos/4113908/pexels-photo-4113908.jpeg?auto=compress&cs=tinysrgb&w=800',
    'двойной сыр': 'https://images.pexels.com/photos/4109084/pexels-photo-4109084.jpeg?auto=compress&cs=tinysrgb&w=800',
    'без лука': 'https://images.pexels.com/photos/533280/pexels-photo-533280.jpeg?auto=compress&cs=tinysrgb&w=800',
    'дополнительный соус': 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=800',
    'двойной пепперони': 'https://images.pexels.com/photos/708587/pexels-photo-708587.jpeg?auto=compress&cs=tinysrgb&w=800',
    'доп сыр': 'https://images.pexels.com/photos/4109084/pexels-photo-4109084.jpeg?auto=compress&cs=tinysrgb&w=800',
    'грибы': 'https://images.pexels.com/photos/255469/pexels-photo-255469.jpeg?auto=compress&cs=tinysrgb&w=800',
    'соус': 'https://images.pexels.com/photos/1437267/pexels-photo-1437267.jpeg?auto=compress&cs=tinysrgb&w=800',
    'доп': 'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=800',
    'моцарелла': 'https://images.pexels.com/photos/821365/pexels-photo-821365.jpeg?auto=compress&cs=tinysrgb&w=800',
    'чеддер': 'https://images.pexels.com/photos/4109947/pexels-photo-4109947.jpeg?auto=compress&cs=tinysrgb&w=800',
    'оливки': 'https://images.pexels.com/photos/1583884/pexels-photo-1583884.jpeg?auto=compress&cs=tinysrgb&w=800',
    'пармезан': 'https://images.pexels.com/photos/821365/pexels-photo-821365.jpeg?auto=compress&cs=tinysrgb&w=800',
};

const PROMOTION_IMAGE_BY_NAME = {
    '1+1': 'https://images.unsplash.com/photo-1594007654729-407eedc4be65?w=1200&q=80&auto=format&fit=crop',
    'комбо': 'https://images.unsplash.com/photo-1600891964599-f61ba0e24092?w=1200&q=80&auto=format&fit=crop',
    'пицца': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&q=80&auto=format&fit=crop',
    'напит': 'https://images.unsplash.com/photo-1551024709-8f23befc6cf7?w=1200&q=80&auto=format&fit=crop',
};

function normalizeImagePath(imagePath) {
    if (!imagePath) return '';
    const image = String(imagePath).trim();
    if (!image) return '';
    if (/^(https?:)?\/\//i.test(image) || image.startsWith('data:') || image.startsWith('blob:')) {
        return image;
    }
    return image.startsWith('/') ? image : `/${image}`;
}

window.resolveMenuItemImage = function resolveMenuItemImage(item) {
    const normalizedName = String(item?.name || '').trim().toLowerCase();
    const namedImage = Object.entries(PRODUCT_IMAGE_BY_NAME).find(([key]) => normalizedName.includes(key))?.[1];

    const normalizedOriginal = normalizeImagePath(item?.image);
    if (normalizedOriginal) return normalizedOriginal;
    if (namedImage) return namedImage;

    const categoryImage = CATEGORY_FALLBACK_IMAGES[item?.categorySlug] || '/images/icon.jpg';
    return categoryImage;
};


window.resolvePromotionImage = function resolvePromotionImage(promo) {
    const normalizedOriginal = normalizeImagePath(promo?.imageUrl);
    if (normalizedOriginal) return normalizedOriginal;

    const normalizedTitle = `${promo?.title || ''} ${promo?.subtitle || ''}`.trim().toLowerCase();
    const byName = Object.entries(PROMOTION_IMAGE_BY_NAME).find(([key]) => normalizedTitle.includes(key))?.[1];
    return byName || '/images/hero_banner.png';
};

window.resolveModifierImage = function resolveModifierImage(modifier) {
    const normalizedOriginal = normalizeImagePath(modifier?.image);
    if (normalizedOriginal) return normalizedOriginal;

    const normalizedName = String(modifier?.name || '').trim().toLowerCase();
    const byName = MODIFIER_IMAGE_BY_NAME[normalizedName]
        || Object.entries(MODIFIER_IMAGE_BY_NAME).find(([key]) => normalizedName.includes(key))?.[1];
    if (byName) return byName;

    const groupName = String(modifier?.groupName || modifier?.category || '').toLowerCase();
    const byGroup = Object.entries(MODIFIER_IMAGE_BY_NAME).find(([key]) => groupName.includes(key))?.[1];
    return byGroup || 'https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=800';
};

function safeLocalStorageGetJson(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (error) {
        console.warn(`[Storage] Failed to parse key "${key}":`, error);
        return fallback;
    }
}

function safeLocalStorageSetJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`[Storage] Failed to write key "${key}":`, error);
    }
}

// ── Polyfill db object for compatibility ──
window.db = {
    getAvailableMenu: (cat) => {
        const targetCategory = cat || currentCategory;
        if (!targetCategory) return [];
        return menuItems.filter((p) => p.categorySlug === targetCategory);
    },
    getMenuItem: (id) => menuItems.find((p) => p.id === id),
    getMenu: () => menuItems,
};

// ── DOM shortcut ──
const $ = id => document.getElementById(id);

// ── API Helper ──
async function api(path, options = {}) {
    const normalizedPath = path.startsWith('/api/') ? path.replace('/api', '') : path;
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    try {
        const res = await fetch(`${API_BASE}${normalizedPath}`, { ...options, headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
        return data;
    } catch (err) {
        // Intercept checkout network errors (Offline)
        if (path === '/api/orders/checkout' && (!navigator.onLine || err instanceof TypeError && err.message.includes('fetch'))) {
            console.log('[API] Offline detected, queuing order...');
            const orderPayload = JSON.parse(options.body);
            orderPayload._tempId = Date.now();
            
            let offlineOrders = safeLocalStorageGetJson('offline_orders', []);
            if (!Array.isArray(offlineOrders)) offlineOrders = [];
            offlineOrders.push(orderPayload);
            safeLocalStorageSetJson('offline_orders', offlineOrders);
            
            return {
                offline: true,
                message: "Офлайн"
            };
        }
        throw err;
    }
}

// ── Toast ──
window.showToast = function (type, message, duration = 2000) {
    const el = $('toast');
    const msg = $('toast-message');
    if (!el || !msg) return;

    msg.textContent = message;
    el.classList.add('is-visible');

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        el.classList.remove('is-visible');
    }, duration);
};

// ── App modal (replaces alert/confirm) ──
window.showAppModal = function showAppModal(message, title = 'Уведомление') {
    return new Promise((resolve) => {
        const modal = $('app-modal');
        const titleEl = $('app-modal-title');
        const messageEl = $('app-modal-message');
        const okBtn = $('app-modal-ok');

        if (!modal || !titleEl || !messageEl || !okBtn) {
            console.warn('[Modal] Missing modal elements');
            resolve(true);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        const close = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            okBtn.removeEventListener('click', onOk);
            modal.removeEventListener('click', onBackdrop);
            resolve(true);
        };

        const onOk = () => close();
        const onBackdrop = (event) => {
            if (event.target === modal) close();
        };

        okBtn.addEventListener('click', onOk);
        modal.addEventListener('click', onBackdrop);
    });
};

// ── Fetch Menu (categories + items) ──
async function fetchMenu() {
    try {
        const data = await api('/api/menu');
        menuCategories = Array.isArray(data) ? data : [];
        menuItems = menuCategories.flatMap((category) =>
            (category.products || []).map((product) => ({
                ...product,
                categorySlug: category.slug,
                categoryName: category.name,
            }))
        );
        currentCategory = menuCategories[0]?.slug || null;
    } catch (err) {
        console.error('[Menu] Fetch error:', err);
        showToast('error', 'Не удалось загрузить меню');
    }
}

async function fetchPromotions() {
    try {
        const data = await api('/api/promotions');
        promotions = Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('[Promotions] Fetch error:', err);
        showToast('error', 'Не удалось загрузить акции');
    }
}
