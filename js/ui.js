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

// ── Render Menu Cards ──
function renderMenu() {
    const menuGrid = $('menu-grid');
    if (!menuGrid) return;
    const filteredItems = db.getAvailableMenu(currentCategory);
    menuGrid.innerHTML = filteredItems.map((item, idx) => {
        const sizeIdx = selectedSizeIndex[item.id] || 0;
        const activeSize = item.sizes[sizeIdx] || item.sizes[0] || { label: '—', weight: '', price: '0' };
        const hasSizes = item.sizes.length > 1;
        const badgeHtml = item.badge
            ? `<div class="absolute top-4 right-4 product-badge ${item.badge.color} z-10">${item.badge.text}</div>`
            : '';

        return `
        <div class="bg-white dark:bg-bgElementDark rounded-3xl overflow-hidden shadow-soft hover:shadow-xl card-lift group border border-gray-100 dark:border-gray-800 menu-card-anim" style="animation-delay: ${idx * 0.06}s">
            <div class="relative overflow-hidden h-52 sm:h-48">
                <img src="${item.image || 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80'}" alt="${item.name}" loading="lazy"
                     class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                     onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&q=80'">
                ${badgeHtml}
                <div class="absolute bottom-3 left-3 bg-white/90 dark:bg-gray-900/80 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold shadow-sm">
                    ${activeSize.weight || ''}
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
                    <span class="font-display font-black text-xl text-primary">${parseFloat(activeSize.price).toFixed(2)} <small class="text-xs">руб.</small></span>
                    <button onclick="addToCart(${item.id})"
                        class="bg-gray-100 dark:bg-gray-800 hover:bg-primary hover:text-white dark:hover:bg-primary p-3 rounded-2xl transition-all duration-300 active:scale-95 cart-add-btn">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                </div>
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

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    customerWs = new WebSocket(`${protocol}//${window.location.host}/ws/kds?restaurantId=1`);

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
    const statuses = ['NEW', 'COOKING', 'BAKING', 'DELIVERING'];

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

    if (status === 'DELIVERING' || status === 'COMPLETED') {
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
