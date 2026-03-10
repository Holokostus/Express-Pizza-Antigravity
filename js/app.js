// ============================================================
// Express Pizza — app.js (Phase 9: Secure API Integration)
// ============================================================
// SECURITY: No prices are stored or calculated on the client.
// Cart stores only IDs (productSizeId, modifierIds, quantity).
// All pricing is done server-side via POST /api/orders/calculate.
// ============================================================

const API_BASE = 'https://express-pizza-antigravity.onrender.com'; // same origin — will be served from Express

// ============================================================
// 1. State (no prices — only identifiers!)
// ============================================================
let appliedPromoCode = null;   // string code, NOT discount object
let authToken = localStorage.getItem('ep_auth_token') || null;
let cart = JSON.parse(localStorage.getItem('ep_cart')) || [];
// Cart item shape: { productSizeId, modifierIds[], quantity, _display: { name, image, sizeLabel, weight, modifierNames[] } }
let currentCategory = 'pizza';
let selectedSizeIndex = {};
let serverCalculation = null;  // latest server response from /api/orders/calculate

// ============================================================
// 2. showToast
// ============================================================
window.showToast = function (type, message, duration = 3000) {
    const el = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');
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

// ============================================================
// 3. API Helper
// ============================================================
async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
}

// ============================================================
// 4. DOMContentLoaded
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {

    const $ = id => document.getElementById(id);

    // ================================================================
    // Menu API Fetch logic
    // ================================================================
    let menuItems = [];

    // Polyfill db object for compatibility with old render logic
    window.db = {
        getAvailableMenu: (cat) => menuItems.filter(p => typeof p.category === 'object' ? p.category.slug === cat : p.categorySlug === cat),
        getMenuItem: (id) => menuItems.find(p => p.id === id)
    };

    async function fetchMenu() {
        try {
            const data = await api('/api/menu');
            // Flatten product tree
            menuItems = [];
            data.categories.forEach(cat => {
                cat.products.forEach(p => {
                    p.categorySlug = cat.slug; // ensure slug is mapped
                    menuItems.push(p);
                });
            });
        } catch (err) {
            console.error('[Menu] Fetch error:', err);
            showToast('error', 'Не удалось загрузить меню');
        }
    }

    const menuGrid = $('menu-grid');
    const cartSidebar = $('cart-sidebar');
    const cartItemsContainer = $('cart-items');
    const cartBadge = $('cart-badge');
    const cartFooter = $('cart-footer');
    const emptyCartMessage = $('empty-cart');
    const themeToggleBtn = $('theme-toggle');
    const htmlTag = document.documentElement;
    const floatingCart = $('floating-cart');
    const closeCartBtn = $('close-cart');
    const cartOverlay = $('cart-overlay');
    const cartPanel = $('cart-panel');
    const orderForm = $('order-form');

    // ================================================================
    // Theme toggle
    // ================================================================
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlTag.setAttribute('data-theme', 'dark');
    }
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = htmlTag.getAttribute('data-theme') === 'dark';
            htmlTag.setAttribute('data-theme', isDark ? 'light' : 'dark');
            localStorage.theme = isDark ? 'light' : 'dark';
        });
    }

    // ================================================================
    // Menu category tabs
    // ================================================================
    document.querySelectorAll('.menu-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.menu-tab').forEach(t => {
                t.classList.remove('active', 'bg-primary', 'text-white');
                t.classList.add('bg-gray-100', 'dark:bg-gray-800');
            });
            tab.classList.remove('bg-gray-100', 'dark:bg-gray-800');
            tab.classList.add('active', 'bg-primary', 'text-white');
            currentCategory = tab.dataset.category;
            renderMenu();
        });
    });

    // ================================================================
    // Cart sidebar toggle
    // ================================================================
    const toggleCart = (show) => {
        if (!cartSidebar) return;
        if (show) {
            cartSidebar.classList.remove('pointer-events-none');
            cartOverlay.classList.replace('opacity-0', 'opacity-100');
            cartOverlay.classList.add('pointer-events-auto');
            cartPanel.classList.replace('translate-x-full', 'translate-x-0');
            document.body.style.overflow = 'hidden';
        } else {
            cartSidebar.classList.add('pointer-events-none');
            cartOverlay.classList.replace('opacity-100', 'opacity-0');
            cartOverlay.classList.remove('pointer-events-auto');
            cartPanel.classList.replace('translate-x-0', 'translate-x-full');
            document.body.style.overflow = '';
        }
    };

    if (floatingCart) floatingCart.addEventListener('click', () => toggleCart(true));
    if (closeCartBtn) closeCartBtn.addEventListener('click', () => toggleCart(false));
    if (cartOverlay) cartOverlay.addEventListener('click', () => toggleCart(false));

    // ================================================================
    // Skeleton Loader
    // ================================================================
    function showSkeletons(count = 8) {
        if (!menuGrid) return;
        menuGrid.innerHTML = Array.from({ length: count }, () => `
            <div class="bg-white dark:bg-bgElementDark rounded-3xl overflow-hidden shadow-soft border border-gray-100 dark:border-gray-800 animate-pulse">
                <div class="h-52 sm:h-48 bg-gray-200 dark:bg-gray-800"></div>
                <div class="p-5 space-y-3">
                    <div class="h-5 bg-gray-200 dark:bg-gray-800 rounded-lg w-3/4"></div>
                    <div class="h-3 bg-gray-100 dark:bg-gray-800/60 rounded-lg w-full"></div>
                    <div class="h-3 bg-gray-100 dark:bg-gray-800/60 rounded-lg w-2/3"></div>
                    <div class="flex gap-1 mt-2">
                        <div class="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg flex-1"></div>
                        <div class="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg flex-1"></div>
                        <div class="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg flex-1"></div>
                    </div>
                    <div class="flex items-center justify-between pt-2">
                        <div class="h-6 bg-gray-200 dark:bg-gray-800 rounded-lg w-24"></div>
                        <div class="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-2xl"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ================================================================
    // Render menu (still from local db for fast rendering)
    // ================================================================
    function renderMenu() {
        if (!menuGrid) return;
        const filteredItems = db.getAvailableMenu(currentCategory);
        menuGrid.innerHTML = filteredItems.map((item, idx) => {
            const sizeIdx = selectedSizeIndex[item.id] || 0;
            const activeSize = item.sizes[sizeIdx];
            const hasSizes = item.sizes.length > 1;
            const staggerClass = `stagger-${Math.min(idx + 1, 6)}`;
            const badgeHtml = item.badge
                ? `<div class="absolute top-4 right-4 product-badge ${item.badge.color} z-10">${item.badge.text}</div>`
                : '';

            return `
            <div class="bg-white dark:bg-bgElementDark rounded-3xl overflow-hidden shadow-soft hover:shadow-xl card-lift group border border-gray-100 dark:border-gray-800 animate-fade-in-up ${staggerClass}">
                <div class="relative overflow-hidden h-52 sm:h-48">
                    <img src="${item.image}" alt="${item.name}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700">
                    ${badgeHtml}
                    <div class="absolute bottom-3 left-3 bg-white/90 dark:bg-gray-900/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                        ${activeSize.weight}
                    </div>
                </div>
                <div class="p-5">
                    <h3 class="font-bold text-lg mb-1">${item.name}</h3>
                    <p class="text-textMutedLight dark:text-textMutedDark text-xs mb-4 line-clamp-2 h-8">${item.description}</p>
                    ${hasSizes ? `
                    <div class="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                        ${item.sizes.map((s, i) => `
                            <button onclick="selectSize(${item.id}, ${i})"
                                class="flex-1 text-xs font-bold py-1.5 rounded-lg transition-all ${i === sizeIdx ? 'bg-primary text-white shadow-md' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}">
                                ${s.label}
                            </button>
                        `).join('')}
                    </div>
                    ` : ''}
                    <div class="flex items-center justify-between">
                        <span class="font-display font-black text-xl text-primary">${activeSize.price.toFixed(2)} <small class="text-xs">руб.</small></span>
                        <button onclick="addToCart(${item.id})" class="bg-gray-100 dark:bg-gray-800 hover:bg-primary hover:text-white dark:hover:bg-primary p-3 rounded-2xl transition-all duration-300 active:scale-95">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    }

    window.selectSize = (itemId, sizeIndex) => {
        selectedSizeIndex[itemId] = sizeIndex;
        renderMenu();
    };

    // ================================================================
    // SERVER-SIDE Cart Calculation (the security core)
    // ================================================================
    // Debounced: calls POST /api/orders/calculate to get authoritative prices.
    // Falls back to local display data if server unreachable.
    let _calcTimeout = null;

    async function recalculateCartFromServer() {
        if (cart.length === 0) {
            serverCalculation = null;
            renderCartUI(null);
            return;
        }

        const payload = {
            items: cart.map(i => ({
                productSizeId: i.productSizeId,
                modifierIds: i.modifierIds || [],
                quantity: i.quantity,
            })),
            promoCode: appliedPromoCode || undefined,
        };

        try {
            const result = await api('/api/orders/calculate', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            serverCalculation = result;
            renderCartUI(result);
        } catch (err) {
            console.warn('[Cart] Server calculation failed, using local display:', err.message);
            renderCartUI(null); // fallback: show items without server-verified totals
        }
    }

    function debouncedRecalculate() {
        clearTimeout(_calcTimeout);
        _calcTimeout = setTimeout(recalculateCartFromServer, 300);
    }

    // ================================================================
    // Cart UI Render (uses server-calculated prices when available)
    // ================================================================
    function renderCartUI(serverData) {
        const totalCount = cart.reduce((s, i) => s + i.quantity, 0);
        const mobileBadge = $('cart-badge-mobile');

        // Upsells
        renderUpsells();

        if (totalCount > 0) {
            if (cartBadge) { cartBadge.textContent = totalCount; cartBadge.classList.replace('opacity-0', 'opacity-100'); }
            if (mobileBadge) { mobileBadge.textContent = totalCount; mobileBadge.classList.replace('opacity-0', 'opacity-100'); }
            if (cartFooter) cartFooter.classList.remove('hidden');
            if (emptyCartMessage) emptyCartMessage.classList.add('hidden');
        } else {
            if (cartBadge) cartBadge.classList.replace('opacity-100', 'opacity-0');
            if (mobileBadge) mobileBadge.classList.replace('opacity-100', 'opacity-0');
            if (cartFooter) cartFooter.classList.add('hidden');
            if (emptyCartMessage) emptyCartMessage.classList.remove('hidden');
        }

        // Cart items — use server data if available, fall back to display data
        const displayItems = serverData ? serverData.items : cart.map(i => ({
            name: i._display.name,
            image: i._display.image,
            sizeLabel: i._display.sizeLabel,
            modifiers: i._display.modifierNames.map(n => ({ name: n })),
            unitPrice: 0, // unknown without server
            quantity: i.quantity,
        }));

        if (cartItemsContainer) {
            cartItemsContainer.innerHTML = cart.length === 0
                ? `<div class="text-center py-12">
                        <div class="text-6xl mb-4">🍕</div>
                        <p class="text-textMutedLight dark:text-textMutedDark">Ваша корзина пуста</p>
                        <button onclick="document.getElementById('close-cart').click()" class="mt-4 text-primary font-bold hover:underline">Вернуться в меню</button>
                   </div>`
                : cart.map((item, idx) => {
                    const sd = displayItems[idx];
                    const name = sd?.name || item._display.name;
                    const image = sd?.image || item._display.image;
                    const sizeLabel = sd?.sizeLabel || item._display.sizeLabel;
                    const mods = sd?.modifiers?.map(m => m.name) || item._display.modifierNames;
                    const linePrice = sd ? (sd.unitPrice * sd.quantity) : null;

                    return `
                    <div class="flex items-center gap-4 animate-fade-in group relative">
                        <img src="${image}" class="w-16 h-16 rounded-2xl object-cover bg-gray-50 dark:bg-gray-900 flex-shrink-0">
                        <div class="flex-grow min-w-0 pr-2">
                            <h4 class="font-bold text-sm mb-0.5 truncate">${name}</h4>
                            <div class="flex flex-col gap-0.5">
                                ${sizeLabel ? `<span class="text-[11px] text-textMutedLight dark:text-textMutedDark">${sizeLabel}</span>` : ''}
                                ${mods.length > 0 ? `<span class="text-[10px] text-primary bg-primary/10 inline-block px-1.5 py-0.5 rounded uppercase self-start truncate max-w-full">${mods.join(', ')}</span>` : ''}
                            </div>
                            <div class="flex items-center justify-between mt-1">
                                <div class="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-lg px-2 py-1">
                                    <button onclick="changeQuantity(${idx}, -1)" class="w-6 h-6 flex items-center justify-center hover:text-primary transition-colors font-bold">−</button>
                                    <span class="font-bold text-sm min-w-[18px] text-center">${item.quantity}</span>
                                    <button onclick="changeQuantity(${idx}, 1)" class="w-6 h-6 flex items-center justify-center hover:text-primary transition-colors font-bold">+</button>
                                </div>
                                <span class="font-bold text-primary text-sm">${linePrice !== null ? linePrice.toFixed(2) + ' р.' : '...'}</span>
                            </div>
                        </div>
                    </div>`;
                }).join('');
        }

        // Totals area
        const totalsArea = $('cart-totals-area');
        if (totalsArea && serverData) {
            const { subtotal, discount, total, promo } = serverData;
            let html = '';
            if (promo && discount > 0) {
                html = `
                    <div class="flex items-center justify-between text-sm mb-1">
                        <span class="text-textMutedLight dark:text-textMutedDark">Сумма:</span>
                        <span class="line-through text-textMutedLight dark:text-textMutedDark">${subtotal.toFixed(2)} руб.</span>
                    </div>
                    <div class="flex items-center justify-between text-sm mb-1">
                        <span class="text-green-600 dark:text-green-400">${promo.label}</span>
                        <span class="text-green-600 dark:text-green-400">−${discount.toFixed(2)} руб.</span>
                    </div>
                    <div class="flex items-center justify-between mt-2">
                        <span class="font-bold text-lg">Итого:</span>
                        <span class="font-display font-black text-2xl text-primary">${total.toFixed(2)} руб.</span>
                    </div>`;
            } else {
                html = `
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-lg">Итого:</span>
                        <span class="font-display font-black text-2xl text-primary">${total.toFixed(2)} руб.</span>
                    </div>`;
            }
            totalsArea.innerHTML = html;

            // COD limit (server-calculated total)
            evaluateRisk(total);
        } else if (totalsArea && cart.length === 0) {
            totalsArea.innerHTML = `
                <div class="flex items-center justify-between">
                    <span class="font-bold text-lg">Итого:</span>
                    <span class="font-display font-black text-2xl text-primary">0.00 руб.</span>
                </div>`;
        }

        localStorage.setItem('ep_cart', JSON.stringify(cart));
    }

    // ================================================================
    // Add to Cart — stores IDs, not prices
    // ================================================================
    window.addToCart = (id) => {
        const item = db.getMenuItem(id);
        if (!item) return;

        if (!item.isAvailable) {
            showToast('error', 'Позиция временно недоступна (стоп-лист)');
            return;
        }

        // Pizza → customizer
        if (item.category === 'pizza') {
            openCustomizer(id);
            return;
        }

        // Non-pizza: straight to cart
        const sizeIdx = selectedSizeIndex[id] || 0;
        const size = item.sizes[sizeIdx];

        // SECURITY: store only IDs, server will look up prices
        const existing = cart.find(i => i.productSizeId === size.id && (i.modifierIds || []).length === 0);
        if (existing) {
            existing.quantity++;
        } else {
            cart.push({
                productSizeId: size.id,
                modifierIds: [],
                quantity: 1,
                _display: {
                    name: item.name,
                    image: item.image,
                    sizeLabel: size.label,
                    weight: size.weight,
                    modifierNames: [],
                },
            });
        }

        debouncedRecalculate();
        showToast('success', `${item.name} (${size.label}) добавлено`);
    };

    window.changeQuantity = (index, delta) => {
        if (!cart[index]) return;
        cart[index].quantity += delta;
        if (cart[index].quantity <= 0) {
            cart.splice(index, 1);
        }
        debouncedRecalculate();
    };

    // ================================================================
    // Promo code — validated on SERVER
    // ================================================================
    window.applyPromoCode = async () => {
        const input = $('promo-input');
        const btn = $('promo-btn');
        const code = input.value.trim();

        if (!code) { showToast('error', 'Введите промокод'); return; }

        btn.disabled = true;
        btn.textContent = '...';

        // Set promo code and recalculate via server
        appliedPromoCode = code;
        try {
            await recalculateCartFromServer();
            if (serverCalculation && serverCalculation.promo) {
                showToast('success', `Промокод применён: ${serverCalculation.promo.label}`);
                input.disabled = true;
                btn.textContent = '✓';
                btn.classList.replace('bg-primary', 'bg-green-600');
            } else {
                // Server rejected promo
                const errorMsg = serverCalculation?.errors?.find(e => e.includes('ромокод')) || 'Промокод не найден';
                throw new Error(errorMsg);
            }
        } catch (err) {
            showToast('error', err.message);
            btn.disabled = false;
            btn.textContent = 'OK';
            appliedPromoCode = null;
            debouncedRecalculate();
        }
    };

    // ================================================================
    // COD Risk Evaluation (uses server-calculated total)
    // ================================================================
    function evaluateRisk(total) {
        const cashLabel = $('payment-cash-label');
        const cashRadio = $('payment-cash-radio');
        const warning = $('cash-limit-warning');
        if (!cashLabel || !cashRadio) return;

        if (total >= 100) {
            cashRadio.disabled = true;
            cashLabel.classList.add('opacity-50', 'pointer-events-none');
            if (warning) warning.classList.remove('hidden');
            if (cashRadio.checked) {
                const onlineRadio = document.querySelector('input[value="bepaid_online"]');
                if (onlineRadio) onlineRadio.checked = true;
            }
        } else {
            cashRadio.disabled = false;
            cashLabel.classList.remove('opacity-50', 'pointer-events-none');
            if (warning) warning.classList.add('hidden');
        }
    }

    // ================================================================
    // OTP Flow — calls REAL backend endpoints
    // ================================================================
    window.requestOTP = async () => {
        if (!orderForm.checkValidity()) {
            orderForm.reportValidity();
            return;
        }

        const phone = $('user-phone').value;
        const paymentMethod = document.querySelector('input[name="payment"]:checked');
        if (!paymentMethod) {
            showToast('error', 'Выберите способ оплаты');
            return;
        }

        const btn = $('btn-request-otp');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Отправка SMS...'; }

        try {
            await api('/api/auth/send-sms', {
                method: 'POST',
                body: JSON.stringify({ phone }),
            });

            orderForm.classList.add('hidden');
            const otpStep = $('otp-step');
            if (otpStep) otpStep.classList.remove('hidden');
            const phoneDisplay = $('otp-phone-display');
            if (phoneDisplay) phoneDisplay.textContent = phone;
            const otpInput = $('otp-input');
            if (otpInput) otpInput.focus();
        } catch (err) {
            showToast('error', err.message || 'Ошибка отправки SMS');
            if (btn) { btn.disabled = false; btn.innerHTML = 'К Оформлению'; }
        }
    };

    window.verifyOTPAndSubmit = async () => {
        const otpInput = $('otp-input');
        const code = otpInput ? otpInput.value : '';
        const phone = $('user-phone') ? $('user-phone').value : '';
        const name = $('user-name') ? $('user-name').value : '';

        if (!code || code.length < 4) {
            showToast('error', 'Введите 4-значный код');
            return;
        }

        const verifyBtn = $('btn-verify-otp');
        if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Проверка...'; }

        try {
            // Step 1: Verify OTP and get JWT
            const authResult = await api('/api/auth/verify', {
                method: 'POST',
                body: JSON.stringify({ phone, code, name }),
            });

            authToken = authResult.token;
            localStorage.setItem('ep_auth_token', authToken);

            // Step 2: Place order via secured endpoint
            const address = $('user-address') ? $('user-address').value : '';
            const paymentMethod = document.querySelector('input[name="payment"]:checked');

            if (verifyBtn) verifyBtn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Оформляем...';

            const orderResult = await api('/api/orders/checkout', {
                method: 'POST',
                body: JSON.stringify({
                    items: cart.map(i => ({
                        productSizeId: i.productSizeId,
                        modifierIds: i.modifierIds || [],
                        quantity: i.quantity,
                    })),
                    promoCodeString: appliedPromoCode || undefined,
                    customerName: name,
                    customerAddress: address,
                    payment: paymentMethod ? paymentMethod.value.toUpperCase() : 'BEPAID_ONLINE',
                    restaurantId: 1
                }),
            });

            // Success!
            showOrderTracker(orderResult.orderNumber || orderResult.orderId);

            // If payment link returned, redirect
            if (orderResult.checkoutUrl) {
                window.location.href = orderResult.checkoutUrl;
                return;
            }

            // Notify integrations
            if (typeof eventBus !== 'undefined') eventBus.emit('ORDER_PLACED', orderResult.order);

            // Reset cart
            cart = [];
            appliedPromoCode = null;
            serverCalculation = null;
            renderCartUI(null);

            // Reset OTP form
            setTimeout(() => {
                if (orderForm) { orderForm.reset(); orderForm.classList.remove('hidden'); }
                const otpStep = $('otp-step');
                if (otpStep) otpStep.classList.add('hidden');
                const reqBtn = $('btn-request-otp');
                if (reqBtn) { reqBtn.disabled = false; reqBtn.innerHTML = 'К Оформлению'; }
                if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerHTML = '<span>Подтвердить и Заказать</span>'; }
                if (otpInput) otpInput.value = '';
            }, 1000);

        } catch (err) {
            showToast('error', err.message || 'Ошибка оформления заказа');
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerHTML = '<span>Подтвердить и Заказать</span>'; }
        }
    };

    // ================================================================
    // Order Tracker
    // ================================================================
    function showOrderTracker(orderId) {
        toggleCart(false);
        const trackerIdEl = $('tracker-id');
        if (trackerIdEl) trackerIdEl.textContent = orderId;
        const tracker = $('order-tracker');
        if (!tracker) return;
        tracker.classList.remove('hidden');
        tracker.classList.add('flex');
        document.body.style.overflow = 'hidden';

        const steps = ['step-new', 'step-cooking', 'step-baking', 'step-delivery'];
        let currentStep = 0;
        steps.forEach(id => { const el = $(id); if (el) el.classList.add('opacity-50', 'grayscale'); });
        const first = $(steps[0]); if (first) first.classList.remove('opacity-50', 'grayscale');

        if (window._trackerInterval) clearInterval(window._trackerInterval);
        window._trackerInterval = setInterval(() => {
            currentStep++;
            if (currentStep < steps.length) {
                const el = $(steps[currentStep]); if (el) el.classList.remove('opacity-50', 'grayscale');
            } else {
                clearInterval(window._trackerInterval);
            }
        }, 5000);
    }

    window.closeTracker = () => {
        const tracker = $('order-tracker');
        if (tracker) { tracker.classList.add('hidden'); tracker.classList.remove('flex'); }
        document.body.style.overflow = '';
        if (window._trackerInterval) clearInterval(window._trackerInterval);
    };

    // ================================================================
    // Pizza Customizer — stores modifier IDs, not prices
    // ================================================================
    let currentCustomizerItem = null;
    let customizerBasePrice = 0;

    // Modifier ID map (must match DB seed)
    const MODIFIER_MAP = {
        'mod-cheese-crust': { dbName: 'Сырный бортик', previewPrice: 4.0 },
        'mod-jalapeno': { dbName: 'Халапеньо', previewPrice: 1.5 },
        'mod-double-cheese': { dbName: 'Двойной сыр', previewPrice: 3.0 },
        'mod-no-onion': { dbName: 'Без лука', previewPrice: 0.0 },
    };

    function openCustomizer(itemId) {
        const itemInfo = db.getMenuItem(itemId);
        if (!itemInfo) return;

        currentCustomizerItem = itemInfo;
        const sizeIdx = selectedSizeIndex[itemId] || 0;
        customizerBasePrice = itemInfo.sizes[sizeIdx].price;

        Object.keys(MODIFIER_MAP).forEach(id => {
            const cb = $(id); if (cb) cb.checked = false;
        });

        const title = $('cust-title');
        if (title) title.textContent = `${itemInfo.name} | ${itemInfo.sizes[sizeIdx].label}`;
        const img = $('cust-img');
        if (img) img.src = itemInfo.image;
        const desc = $('cust-desc');
        if (desc) desc.textContent = itemInfo.description || 'Идеальное сочетание ингредиентов по фирменному рецепту.';
        updateCustomizerTotal();

        const modal = $('pizza-customizer-modal');
        const sheet = $('customizer-sheet');
        if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
        requestAnimationFrame(() => {
            if (modal) modal.classList.remove('opacity-0');
            if (sheet) sheet.classList.remove('translate-y-full');
        });
    }

    window.closeCustomizer = () => {
        const modal = $('pizza-customizer-modal');
        const sheet = $('customizer-sheet');
        if (modal) modal.classList.add('opacity-0');
        if (sheet) sheet.classList.add('translate-y-full');
        setTimeout(() => {
            if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
        }, 300);
    };

    // Preview price in customizer (cosmetic only — server recalculates)
    window.updateCustomizerTotal = () => {
        let price = customizerBasePrice;
        for (const [elemId, mod] of Object.entries(MODIFIER_MAP)) {
            const cb = $(elemId);
            if (cb && cb.checked) price += mod.previewPrice;
        }
        const ct = $('cust-total');
        if (ct) ct.textContent = price.toFixed(2) + ' р.';
    };

    window.addCustomizedItem = () => {
        if (!currentCustomizerItem) return;

        const modifierNames = [];
        const modifierIds = [];

        // Collect checked modifiers — we need their DB IDs
        // The IDs will be resolved when the product's modifiers are available
        for (const [elemId, mod] of Object.entries(MODIFIER_MAP)) {
            const cb = $(elemId);
            if (cb && cb.checked) {
                modifierNames.push(mod.dbName);
                // Find modifier ID from the product's available modifiers (from localStorage/db)
                const dbMod = (currentCustomizerItem.modifiers || []).find(m => m.name === mod.dbName);
                if (dbMod) modifierIds.push(dbMod.id);
            }
        }

        const sizeIdx = selectedSizeIndex[currentCustomizerItem.id] || 0;
        const size = currentCustomizerItem.sizes[sizeIdx];

        cart.push({
            productSizeId: size.id,          // DB ProductSize.id
            modifierIds,                      // DB ProductModifier.id[]
            quantity: 1,
            _display: {
                name: currentCustomizerItem.name,
                image: currentCustomizerItem.image,
                sizeLabel: size.label,
                weight: size.weight,
                modifierNames,
            },
        });

        closeCustomizer();
        showToast('success', `${currentCustomizerItem.name} добавлена в корзину!`);
        debouncedRecalculate();

        if (cartBadge) { cartBadge.classList.add('scale-150'); setTimeout(() => cartBadge.classList.remove('scale-150'), 200); }
    };

    // ================================================================
    // Upsells
    // ================================================================
    function renderUpsells() {
        const widget = $('upsell-widget');
        const container = $('upsell-container');
        if (!widget || !container) return;

        if (cart.length === 0) { widget.classList.add('hidden'); return; }

        const sauces = db.getAvailableMenu('sauce').slice(0, 2);
        const drinks = db.getAvailableMenu('drinks').slice(0, 2);
        const upsells = [...sauces, ...drinks];

        if (upsells.length === 0) { widget.classList.add('hidden'); return; }

        widget.classList.remove('hidden');
        container.innerHTML = upsells.map(item => `
            <div class="flex-shrink-0 w-24 bg-white dark:bg-bgElementDark rounded-2xl p-2 border border-gray-100 dark:border-gray-800 shadow-sm text-center cursor-pointer hover:border-primary transition-colors" onclick="addToCart(${item.id})">
                <img src="${item.image}" class="w-12 h-12 mx-auto object-cover rounded-lg mb-2">
                <p class="text-[10px] font-bold leading-tight line-clamp-2 min-h-[24px]">${item.name}</p>
                <div class="mt-2 text-primary text-[10px] font-bold">+ ${item.sizes[0].price.toFixed(2)} р.</div>
            </div>
        `).join('');
    }

    // ================================================================
    // Delivery Timer
    // ================================================================
    function updateTimer() {
        const el = $('delivery-timer');
        if (el) el.textContent = `Среднее время: ${Math.floor(Math.random() * 11 + 20)} мин`;
    }
    setInterval(updateTimer, 60000);
    updateTimer();

    // ================================================================
    // Boot
    // ================================================================
    showSkeletons();

    // Wait for Menu API to initialize app state
    await fetchMenu();

    renderMenu();
    debouncedRecalculate(); // will call renderCartUI
    console.log('[Express Pizza] App initialized ✓ (Secure API mode)');
});
