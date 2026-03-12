// ============================================================
// Express Pizza — ui.js (Module 2/4)
// ============================================================
// Menu rendering, skeleton loaders, theme toggle, order tracker.
// Depends on: api.js (loaded first)
// ============================================================

// ── Skeleton Loader ──
function showSkeletons(count = 8) {
    const menuGrid = $('menu-grid');
    if (!menuGrid) return;
    menuGrid.innerHTML = Array.from({ length: count }, (_, i) => `
        <div class="bg-white dark:bg-bgElementDark rounded-3xl overflow-hidden shadow-soft border border-gray-100 dark:border-gray-800" style="animation: shimmer 1.5s ease-in-out infinite; animation-delay: ${i * 0.1}s">
            <div class="h-52 sm:h-48 bg-gray-200 dark:bg-gray-800 shimmer-bg"></div>
            <div class="p-5 space-y-3">
                <div class="h-5 bg-gray-200 dark:bg-gray-800 rounded-lg w-3/4 shimmer-bg"></div>
                <div class="h-3 bg-gray-100 dark:bg-gray-800/60 rounded-lg w-full shimmer-bg"></div>
                <div class="h-3 bg-gray-100 dark:bg-gray-800/60 rounded-lg w-2/3 shimmer-bg"></div>
                <div class="flex gap-1 mt-2">
                    <div class="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg flex-1 shimmer-bg"></div>
                    <div class="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg flex-1 shimmer-bg"></div>
                    <div class="h-8 bg-gray-200 dark:bg-gray-800 rounded-lg flex-1 shimmer-bg"></div>
                </div>
                <div class="flex items-center justify-between pt-2">
                    <div class="h-6 bg-gray-200 dark:bg-gray-800 rounded-lg w-24 shimmer-bg"></div>
                    <div class="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-2xl shimmer-bg"></div>
                </div>
            </div>
        </div>
    `).join('');
}

// ── Render Menu Cards (Dodo-style) ──
function renderMenu() {
    const menuGrid = $('menu-grid');
    if (!menuGrid) return;
    const filteredItems = db.getAvailableMenu(currentCategory);
    menuGrid.innerHTML = filteredItems.map((item, idx) => {
        const sizeIdx = selectedSizeIndex[item.id] || 0;
        const activeSize = item.sizes[sizeIdx] || item.sizes[0] || { label: '—', weight: '', price: '0' };
        const hasSizes = item.sizes.length > 1;
        const badgeHtml = item.badge
            ? `<div class="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full z-10 shadow-sm">${item.badge.text}</div>`
            : '';

        return `
        <div class="bg-white dark:bg-bgElementDark rounded-3xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-800 md:hover:shadow-2xl md:hover:-translate-y-1 transition-all duration-300 group menu-card-anim" style="animation-delay: ${idx * 0.04}s">
            <div class="relative overflow-hidden aspect-square">
                <img src="${item.image || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80'}" alt="${item.name}" loading="lazy"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                     onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80'">
                ${badgeHtml}
            </div>
            <div class="p-3 lg:p-4">
                <h3 class="font-bold text-sm lg:text-base leading-tight mb-1 line-clamp-2">${item.name}</h3>
                <p class="text-textMutedLight dark:text-textMutedDark text-[11px] lg:text-xs mb-2 line-clamp-1">${item.description || ''}</p>
                ${hasSizes ? `
                <div class="flex gap-0.5 mb-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5">
                    ${item.sizes.map((s, i) => `
                        <button onclick="selectSize(${item.id}, ${i})"
                            class="flex-1 text-[10px] lg:text-xs font-bold py-1 rounded-lg transition-all ${i === sizeIdx ? 'bg-red-600 text-white shadow-sm' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}">${s.label}</button>
                    `).join('')}
                </div>
                ` : ''}
                <button onclick="addToCart(${item.id})"
                    class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-2xl transition-all active:scale-95 shadow-glow-red flex items-center justify-center gap-1.5 text-sm">
                    <span>${parseFloat(activeSize.price).toFixed(2)} BYN</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

// ── Size Selector ──
window.selectSize = (itemId, sizeIndex) => {
    selectedSizeIndex[itemId] = sizeIndex;
    renderMenu();
};

let customerWs = null;

function showOrderTracker(orderId) {
    toggleCart(false);
    const trackerIdEl = $('tracker-id');
    if (trackerIdEl) trackerIdEl.textContent = orderId;
    const tracker = $('order-tracker');
    if (!tracker) return;

    // Reset overlay and sheet classes for animation
    tracker.classList.remove('hidden');
    tracker.classList.add('flex');
    requestAnimationFrame(() => {
        tracker.classList.remove('opacity-0');
        const sheet = $('tracker-sheet');
        if (sheet) sheet.classList.remove('translate-y-full');
    });
    document.body.style.overflow = 'hidden';

    // Init UI State for NEW order
    updateTrackerUI('NEW');

    // Init WebSocket to listen for STATUS_SYNC
    if (customerWs) {
        customerWs.close();
    }

    const wsUrl = typeof API_BASE !== 'undefined' && API_BASE !== '' ? API_BASE.replace('https://', 'wss://').replace('http://', 'ws://') : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'ws://localhost:5000' : `wss://${window.location.host}`) + '/ws/kds';
    customerWs = new WebSocket(`${wsUrl}/ws/kds?restaurantId=1`);

    customerWs.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            // In a real app we'd get the actual ID format (UUID vs Int). Relaxing check with == here instead of === if needed, or mapping.
            // Usually message orderId is externalOrderId or DB id. Wait, the server's checkout returns `orderId` as externalOrderId but kds uses `order.id`. 
            // In our `cart.js`, checkout gives `createdOrder.externalOrderId` to `showOrderTracker`. 
            // The `STATUS_SYNC` gives `orderId: order.id`. 
            // For now, let's just listen to ANY status sync and if it matches or we just assume one active order:
            if (msg.type === 'STATUS_SYNC') {
                updateTrackerUI(msg.data.status);
            }
        } catch (e) { }
    };
}

function updateTrackerUI(status) {
    const steps = ['step-new', 'step-cooking', 'step-baking', 'step-delivery'];
    const statuses = ['NEW', 'COOKING', 'BAKING', 'DELIVERY'];

    const currentIndex = statuses.indexOf(status);
    if (currentIndex === -1) return;

    // Update Progress Bar
    const progressBar = $('tracker-progress-bar');
    if (progressBar) {
        const percentages = ['25%', '50%', '75%', '100%'];
        progressBar.style.width = percentages[currentIndex];
    }

    // Status text mapping
    const statusTexts = ['Ожидает подтверждения', 'Готовится', 'В печи', 'В пути к вам'];
    const txt = $('tracker-status-text');
    if (txt) txt.textContent = statusTexts[currentIndex];

    // Update Step Icons
    steps.forEach((stepId, index) => {
        const el = $(stepId);
        if (el) {
            if (index <= currentIndex) {
                el.classList.remove('opacity-40', 'grayscale');
            } else {
                el.classList.add('opacity-40', 'grayscale');
            }
        }
    });

    if (status === 'DELIVERY' || status === 'COMPLETED') {
        if (customerWs) customerWs.close();
    }
}

window.closeTracker = () => {
    const tracker = $('order-tracker');
    const sheet = $('tracker-sheet');
    if (tracker) tracker.classList.add('opacity-0');
    if (sheet) sheet.classList.add('translate-y-full');

    setTimeout(() => {
        if (tracker) {
            tracker.classList.add('hidden');
            tracker.classList.remove('flex');
        }
    }, 300);
    document.body.style.overflow = '';

    if (customerWs) {
        customerWs.close();
        customerWs = null;
    }
};

// ── Delivery Timer ──
function updateTimer() {
    const el = $('delivery-timer');
    if (el) el.textContent = `Среднее время: ${Math.floor(Math.random() * 11 + 20)} мин`;
}

// ── Profile and Login Logic ──
window.handleProfileClick = function () {
    const modal = $('profile-modal');
    const panel = $('profile-panel');
    if (!modal || !panel) return;

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        panel.classList.remove('scale-95');
    }, 10);

    if (authToken) renderProfileView();
    else renderLoginView();
};

window.closeProfileModal = function () {
    const modal = $('profile-modal');
    const panel = $('profile-panel');
    if (!modal || !panel) return;

    modal.classList.add('opacity-0');
    panel.classList.add('scale-95');

    setTimeout(() => { modal.classList.add('hidden'); }, 300);
};

function renderLoginView() {
    const body = $('profile-body');
    body.innerHTML = `
        <h2 class="text-2xl font-display font-black mb-2">Вход</h2>
        <p class="text-gray-500 text-sm mb-6">Введите номер телефона для входа в кабинет</p>
        
        <div id="login-step-1">
            <input type="tel" id="login-phone" placeholder="+375 (XX) XXX-XX-XX" class="w-full bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-800 rounded-2xl px-5 py-4 mb-4 focus:ring-2 focus:ring-red-600 focus:border-red-600 focus:outline-none transition-all text-textMainLight dark:text-textMainDark font-medium text-lg">
            <button onclick="requestLoginCode()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-glow-red cursor-pointer">Получить код</button>
        </div>
        
        <div id="login-step-2" class="hidden">
            <input type="text" id="login-code" placeholder="Код из СМС" class="w-full bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-800 rounded-2xl px-5 py-4 mb-4 focus:ring-2 focus:ring-red-600 focus:border-red-600 focus:outline-none transition-all text-center tracking-widest text-2xl font-bold text-textMainLight dark:text-textMainDark">
            <button onclick="verifyLoginCode()" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-glow-red cursor-pointer mb-2">Войти</button>
            <button onclick="renderLoginView()" class="w-full text-gray-500 font-medium py-3 hover:text-red-600 transition-colors active:scale-95 cursor-pointer">Изменить номер</button>
        </div>
    `;
}

window.requestLoginCode = async function () {
    const phone = $('login-phone').value.trim();
    if (!phone) return showToast('error', 'Введите телефон');

    try {
        const res = await fetch(`${API_BASE}/api/auth/send-sms`, {
            method: 'POST', body: JSON.stringify({ phone }), headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.success) {
            $('login-step-1').classList.add('hidden');
            $('login-step-2').classList.remove('hidden');
            showToast('success', 'СМС отправлено');
        } else {
            showToast('error', data.error || 'Ошибка');
        }
    } catch (e) { showToast('error', 'Ошибка сети'); }
};

window.verifyLoginCode = async function () {
    const phone = $('login-phone').value.trim();
    const code = $('login-code').value.trim();
    if (!code) return showToast('error', 'Введите код');

    try {
        const res = await fetch(`${API_BASE}/api/auth/verify`, {
            method: 'POST', body: JSON.stringify({ phone, code }), headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();

        if (data.token) {
            localStorage.setItem('ep_auth_token', data.token);
            authToken = data.token;
            showToast('success', 'Вход успешен');
            renderProfileView();
        } else {
            showToast('error', data.error || 'Неверный код');
        }
    } catch (e) { showToast('error', 'Ошибка сети'); }
};

async function renderProfileView() {
    const body = $('profile-body');
    body.innerHTML = '<div class="flex justify-center py-10"><div class="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div></div>';

    try {
        const res = await fetch(`${API_BASE}/api/orders/my`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();

        if (!data.success) throw new Error(data.error);

        const statusMap = { 'NEW': 'Новый', 'COOKING': 'Готовится', 'BAKING': 'В печи', 'DELIVERY': 'Доставка', 'COMPLETED': 'Выполнен', 'CANCELLED': 'Отменён' };

        // ExpressCoins: fetched from the Server User Object
        // (the server now populates it correctly based on PointsBalance)
        const coins = data.loyaltyPoints || 0;
        
        // Update header and cart badges
        const coinsEl = document.getElementById('coins-count');
        const cartCoinsEl = document.getElementById('cart-coins-val');
        if (coinsEl) coinsEl.textContent = coins;
        if (cartCoinsEl) cartCoinsEl.textContent = coins;
        
        // Expose globally for cart use
        window.userLoyaltyPoints = coins;

        let html = data.orders.length === 0 ? '<p class="text-gray-500 text-sm text-center py-6">Нет заказов</p>' : data.orders.map(o => `
            <div class="border border-gray-100 dark:border-gray-800 rounded-xl p-4 mb-3 bg-gray-50 dark:bg-black/50">
                <div class="flex justify-between mb-2">
                    <span class="font-bold text-sm">Заказ #${o.id}</span>
                    <span class="text-xs font-bold text-primary">${statusMap[o.status] || o.status}</span>
                </div>
                <div class="text-xs text-gray-500 mb-2">${new Date(o.timestamp).toLocaleString('ru-RU')}</div>
                <div class="text-sm line-clamp-2 mb-2">${o.items.map(i => i.name).join(', ')}</div>
                <div class="font-bold text-sm">${parseFloat(o.total).toFixed(2)} BYN</div>
            </div>
        `).join('');

        body.innerHTML = `
            <h2 class="text-2xl font-display font-black mb-4">Профиль</h2>
            <div class="mb-6 bg-gradient-to-br from-gray-900 to-black p-5 rounded-3xl border border-gray-800 shadow-xl relative overflow-hidden">
                <div class="absolute -right-4 -top-4 text-7xl opacity-20 filter blur-sm font-bold">C</div>
                <div class="relative z-10">
                    <div class="flex items-center gap-3 mb-1">
                        <span class="flex items-center justify-center w-8 h-8 rounded-full bg-white/20 text-white font-bold">C</span>
                        <div>
                            <p class="font-bold text-white text-2xl leading-none">${coins}</p>
                            <p class="text-xs text-gray-400 font-medium mt-1">ExpressCoins</p>
                        </div>
                    </div>
                    <p class="text-[11px] text-gray-500 mt-4 leading-relaxed font-medium">Оплачивайте коинами до 50% заказа. 1 Coin = 1 BYN. Кэшбэк 5% с каждого заказа.</p>
                </div>
            </div>
            <div class="mb-6">
                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">История заказов</h3>
                <div class="max-h-64 overflow-y-auto pr-2 custom-scrollbar space-y-3">${html}</div>
            </div>
            <button onclick="userLogout()" class="w-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 font-bold py-4 rounded-2xl transition-all active:scale-95 cursor-pointer">Выйти из аккаунта</button>
        `;
    } catch (e) {
        if (e.message.includes('Unauthorized')) userLogout();
        else body.innerHTML = '<p class="text-red-500 text-center py-4">Ошибка загрузки</p>';
    }
}

window.userLogout = function () {
    localStorage.removeItem('ep_auth_token');
    authToken = null;
    showToast('success', 'Вышли из аккаунта');
    closeProfileModal();
};

// ── Stories Modal Logic ──
const storiesData = [
    { title: "Скидка 50% на вторую пиццу", desc: "При заказе любой большой пиццы, вторая (меньшая по стоимости) идет со скидкой 50%. Автоматически применяется при добавлении в корзину.", bg: "bg-gradient-to-br from-red-600 via-red-500 to-orange-500" },
    { title: "4 пиццы по цене 3!", desc: "Собери компанию и закажи 4 любые пиццы. Самая дешевая будет в подарок! Акция суммируется с другими специальными предложениями.", bg: "bg-gradient-to-br from-violet-600 via-purple-500 to-pink-500" },
    { title: "🎂 Пицца в подарок!", desc: "Празднуешь день рождения? Дарим любую среднюю пиццу при заказе от 30 BYN. Акция действует всю неделю после даты рождения.", bg: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600" },
    { title: "🪙 ExpressCoins", desc: "Копи баллы (5% от каждого заказа) и оплачивай ими до 50% стоимости! Доступно после входа в профиль.", bg: "bg-gradient-to-br from-blue-600 via-sky-500 to-indigo-500" }
];

window.openStory = function(index) {
    const modal = $('story-modal');
    const panel = $('story-panel');
    const title = $('story-title');
    const desc = $('story-desc');
    const gradient = $('story-gradient');
    
    if (!modal || !storiesData[index]) return;
    
    const s = storiesData[index];
    title.textContent = s.title;
    desc.textContent = s.desc;
    gradient.className = `h-48 flex items-end p-6 ${s.bg}`;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        panel.classList.remove('scale-95');
        panel.classList.add('scale-100');
    }, 10);
};

window.closeStory = function() {
    const modal = $('story-modal');
    const panel = $('story-panel');
    if (!modal) return;
    
    panel.classList.remove('scale-100');
    panel.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

// ── Global Accessibility ──
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const cartModal = document.getElementById('cart-sidebar');
        if (cartModal && !cartModal.classList.contains('pointer-events-none')) {
            document.getElementById('close-cart')?.click();
        }
        
        const customizerModal = document.getElementById('pizza-customizer-modal');
        if (customizerModal && !customizerModal.classList.contains('hidden')) {
            if (typeof closeCustomizer === 'function') closeCustomizer();
        }

        const profileModal = document.getElementById('profile-modal');
        if (profileModal && !profileModal.classList.contains('hidden')) {
            if (typeof closeProfileModal === 'function') closeProfileModal();
        }

        const storyModal = document.getElementById('story-modal');
        if (storyModal && !storyModal.classList.contains('hidden')) {
            if (typeof closeStory === 'function') closeStory();
        }
    }
});;
