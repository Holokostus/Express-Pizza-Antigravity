// ============================================================
// Express Pizza — api.js (Module 1/4)
// ============================================================
// Shared API helper, toast notifications, and constants.
// Loaded FIRST via <script> tag. Other modules depend on this.
// ============================================================

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
  ? 'http://localhost:5000' 
  : 'https://express-pizza-antigravity.onrender.com';

// ── State (shared across modules) ──
let appliedPromoCode = null;
let authToken = localStorage.getItem('ep_auth_token') || null;
let cart = JSON.parse(localStorage.getItem('ep_cart')) || [];
let currentCategory = null;
let selectedSizeIndex = {};
let serverCalculation = null;
let menuItems = [];
let menuCategories = [];
let promotions = [];

// ── Polyfill db object for compatibility ──
window.db = {
    getAvailableMenu: (cat) => {
        const targetCategory = cat || currentCategory;
        if (!targetCategory) return [];
        return menuItems.filter((p) => p.categorySlug === targetCategory);
    },
    getMenuItem: (id) => menuItems.find((p) => p.id === id),
};

// ── DOM shortcut ──
const $ = id => document.getElementById(id);

// ── API Helper ──
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    try {
        const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
        return data;
    } catch (err) {
        // Intercept checkout network errors (Offline)
        if (path === '/api/orders/checkout' && (!navigator.onLine || err instanceof TypeError && err.message.includes('fetch'))) {
            console.log('[API] Offline detected, queuing order...');
            const orderPayload = JSON.parse(options.body);
            orderPayload._tempId = Date.now();
            
            let offlineOrders = JSON.parse(localStorage.getItem('offline_orders')) || [];
            offlineOrders.push(orderPayload);
            localStorage.setItem('offline_orders', JSON.stringify(offlineOrders));
            
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

    el.classList.remove('translate-y-[150%]', 'opacity-0');
    el.classList.add('translate-y-0', 'opacity-100');

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        el.classList.add('translate-y-[150%]', 'opacity-0');
        el.classList.remove('translate-y-0', 'opacity-100');
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

