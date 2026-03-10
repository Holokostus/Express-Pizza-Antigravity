// ============================================================
// Express Pizza — api.js (Module 1/4)
// ============================================================
// Shared API helper, toast notifications, and constants.
// Loaded FIRST via <script> tag. Other modules depend on this.
// ============================================================

const API_BASE = 'https://express-pizza-antigravity.onrender.com';

// ── State (shared across modules) ──
let appliedPromoCode = null;
let authToken = localStorage.getItem('ep_auth_token') || null;
let cart = JSON.parse(localStorage.getItem('ep_cart')) || [];
let currentCategory = 'pizza';
let selectedSizeIndex = {};
let serverCalculation = null;
let menuItems = [];

// ── Polyfill db object for compatibility ──
window.db = {
    getAvailableMenu: (cat) => menuItems.filter(p =>
        typeof p.category === 'object' ? p.category.slug === cat : p.categorySlug === cat
    ),
    getMenuItem: (id) => menuItems.find(p => p.id === id),
};

// ── DOM shortcut ──
const $ = id => document.getElementById(id);

// ── API Helper ──
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
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

// ── Fetch Menu ──
async function fetchMenu() {
    try {
        const data = await api('/api/menu');
        menuItems = data;
    } catch (err) {
        console.error('[Menu] Fetch error:', err);
        showToast('error', 'Не удалось загрузить меню');
    }
}
