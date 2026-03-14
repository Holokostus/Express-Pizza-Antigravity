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
    const normalizedOriginal = normalizeImagePath(item?.image);
    if (normalizedOriginal) return normalizedOriginal;

    const categoryImage = CATEGORY_FALLBACK_IMAGES[item?.categorySlug] || '/images/icon.jpg';
    return categoryImage;
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
window.showToast = function (type, message, duration = 3000) {
    const el = $('toast');
    const icon = $('toast-icon');
    const msg = $('toast-message');
    if (!el || !icon || !msg) return;

    icon.textContent = type === 'success' ? '✅' : '❌';
    msg.textContent = message;

    el.style.position = 'fixed';
    el.style.bottom = '20px';
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%) translateY(24px)';
    el.style.background = '#333';
    el.style.color = '#fff';
    el.style.borderRadius = '30px';
    el.style.boxShadow = '0 10px 20px rgba(0,0,0,0.5)';
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.28s ease, transform 0.28s ease';

    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(0)';
    });

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(12px)';
    }, duration);
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
