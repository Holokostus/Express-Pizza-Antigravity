// ============================================================
// Express Pizza — cart.js (Module 3/4)
// ============================================================
// Cart logic, server-side calculation, customizer, upsells.
// Depends on: api.js, ui.js (loaded first)
// ============================================================

// ── Cart Sidebar Toggle ──
function toggleCart(show) {
    const cartSidebar = $('cart-sidebar');
    const cartOverlay = $('cart-overlay');
    const cartPanel = $('cart-panel');
    if (!cartSidebar) return;
    if (show) {
        cartSidebar.classList.remove('pointer-events-none');
        cartOverlay.classList.replace('opacity-0', 'opacity-100');
        cartOverlay.classList.add('pointer-events-auto');
        cartPanel.classList.replace('translate-y-full', 'translate-y-0');
        cartPanel.classList.replace('lg:translate-x-full', 'lg:translate-x-0');
        document.body.style.overflow = 'hidden';
    } else {
        cartSidebar.classList.add('pointer-events-none');
        cartOverlay.classList.replace('opacity-100', 'opacity-0');
        cartOverlay.classList.remove('pointer-events-auto');
        cartPanel.classList.replace('translate-y-0', 'translate-y-full');
        cartPanel.classList.replace('lg:translate-x-0', 'lg:translate-x-full');
        document.body.style.overflow = '';
    }
}

// ── Server-Side Cart Calculation ──
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
        renderCartUI(null);
    }
}

function debouncedRecalculate() {
    clearTimeout(_calcTimeout);
    _calcTimeout = setTimeout(recalculateCartFromServer, 300);
}

// ── COD Risk Evaluation ──
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

// ── Cart UI Render ──
function renderCartUI(serverData) {
    const cartBadge = $('cart-badge');
    const mobileBadge = $('cart-badge-mobile');
    const cartFooter = $('cart-footer');
    const emptyCartMessage = $('empty-cart');
    const cartItemsContainer = $('cart-items');

    const totalCount = cart.reduce((s, i) => s + i.quantity, 0);

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

    const displayItems = serverData ? serverData.items : cart.map(i => ({
        name: i._display.name,
        image: i._display.image,
        sizeLabel: i._display.sizeLabel,
        modifiers: i._display.modifierNames.map(n => ({ name: n })),
        unitPrice: 0,
        quantity: i.quantity,
    }));

    if (cartItemsContainer) {
        cartItemsContainer.innerHTML = cart.length === 0
            ? `<div class="text-center py-12">
                    <div class="w-20 h-20 mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto text-gray-400">
                        <svg class="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                    </div>
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

                const imageHtml = image 
                    ? `<img src="${image}" alt="${name}" class="w-16 h-16 rounded-2xl object-cover bg-gray-50 dark:bg-gray-900 flex-shrink-0 shadow-sm border border-gray-100 dark:border-gray-800" loading="lazy">`
                    : `<div class="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 flex-shrink-0 shadow-sm"><svg class="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`;

                return `
                <div class="flex items-center gap-4 animate-fade-in group relative">
                    ${imageHtml}
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
                            <span class="font-bold text-primary text-sm">${linePrice !== null ? linePrice.toFixed(2) + ' BYN' : '...'}</span>
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
                    <span class="line-through text-textMutedLight dark:text-textMutedDark">${subtotal.toFixed(2)} BYN</span>
                </div>
                <div class="flex items-center justify-between text-sm mb-1">
                    <span class="text-green-600 dark:text-green-400">${promo.label}</span>
                    <span class="text-green-600 dark:text-green-400">−${discount.toFixed(2)} BYN</span>
                </div>
                <div class="flex items-center justify-between mt-2">
                    <span class="font-bold text-lg">Итого:</span>
                    <span class="font-display font-black text-2xl text-primary">${total.toFixed(2)} BYN</span>
                </div>`;
        } else {
            html = `
                <div class="flex items-center justify-between">
                    <span class="font-bold text-lg">Итого:</span>
                    <span class="font-display font-black text-2xl text-primary">${total.toFixed(2)} BYN</span>
                </div>`;
        }
        totalsArea.innerHTML = html;
        evaluateRisk(total);
    } else if (totalsArea && cart.length === 0) {
        totalsArea.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-bold text-lg">Итого:</span>
                <span class="font-display font-black text-2xl text-primary">0.00 BYN</span>
            </div>`;
    }

    localStorage.setItem('ep_cart', JSON.stringify(cart));
}

// ── Add to Cart ──
window.addToCart = (id) => {
    const item = db.getMenuItem(id);
    if (!item) return;

    if (!item.isAvailable) {
        showToast('error', 'Позиция временно недоступна (стоп-лист)');
        return;
    }

    if (item.modifiers && item.modifiers.length > 0) {
        openCustomizer(id);
        return;
    }

    const sizeIdx = selectedSizeIndex[id] || 0;
    const size = item.sizes[sizeIdx];

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

    // Bounce animation on cart badge
    const badge = $('cart-badge');
    if (badge) {
        badge.classList.add('cart-bounce');
        setTimeout(() => badge.classList.remove('cart-bounce'), 400);
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

// ── Promo Code ──
window.applyPromoCode = async () => {
    const input = $('promo-input');
    const btn = $('promo-btn');
    const code = input.value.trim();

    if (!code) { showToast('error', 'Введите промокод'); return; }

    btn.disabled = true;
    btn.textContent = '...';

    appliedPromoCode = code;
    try {
        await recalculateCartFromServer();
        if (serverCalculation && serverCalculation.promo) {
            showToast('success', `Промокод применён: ${serverCalculation.promo.label}`);
            input.disabled = true;
            btn.textContent = '✓';
            btn.classList.replace('bg-primary', 'bg-green-600');
        } else {
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

// ── Pizza Customizer ──
let currentCustomizerItem = null;
let customizerBasePrice = 0;

function openCustomizer(itemId) {
    const itemInfo = db.getMenuItem(itemId);
    if (!itemInfo || !itemInfo.modifiers || itemInfo.modifiers.length === 0) return;

    currentCustomizerItem = itemInfo;
    const sizeIdx = selectedSizeIndex[itemId] || 0;
    customizerBasePrice = parseFloat(itemInfo.sizes[sizeIdx].price);

    const groups = {};
    itemInfo.modifiers.forEach(m => {
        const g = m.groupName || 'Дополнительно';
        if (!groups[g]) groups[g] = [];
        groups[g].push(m);
    });

    let modsHtml = '';
    for (const [group, mods] of Object.entries(groups)) {
        modsHtml += `<p class="text-xs font-bold text-textMutedLight dark:text-textMutedDark uppercase tracking-wider mt-4 mb-2 pl-1">${group}</p>`;
        modsHtml += `<div class="grid grid-cols-2 gap-3 mb-4">`;
        mods.forEach(m => {
            const priceLabel = m.isRemoval ? '' : `+${parseFloat(m.price).toFixed(2)} BYN`;
            const activeColor = m.isRemoval ? 'peer-checked:border-red-500 peer-checked:bg-red-50 dark:peer-checked:bg-red-900/20' : 'peer-checked:border-primary peer-checked:bg-primary/5';
            const icon = m.isRemoval ? '✕' : '+';
            const iconColor = m.isRemoval ? 'text-red-500' : 'text-primary';
            const textColor = m.isRemoval ? 'text-red-500' : 'text-textMainLight dark:text-textMainDark';

            modsHtml += `
                <label class="relative cursor-pointer group">
                    <input type="checkbox" data-mod-id="${m.id}" data-mod-price="${m.price}" data-mod-name="${m.name}"
                           class="peer sr-only cust-mod-cb" onchange="updateCustomizerTotal()">
                    <div class="h-full border-2 border-transparent bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-3 transition-all duration-300 shadow-sm hover:shadow-md ${activeColor} flex flex-col justify-between">
                        <div class="flex justify-between items-start mb-2">
                            <span class="font-bold text-xs ${textColor} leading-tight peer-checked:text-primary pr-2">${m.name}</span>
                            <div class="w-5 h-5 rounded-full bg-white dark:bg-gray-700 shadow-sm flex items-center justify-center peer-checked:bg-primary peer-checked:text-white transition-colors flex-shrink-0">
                                <span class="text-xs font-black ${iconColor} peer-checked:text-white">${icon}</span>
                            </div>
                        </div>
                        <span class="text-xs font-bold text-gray-500 mt-1">${priceLabel}</span>
                    </div>
                </label>`;
        });
        modsHtml += `</div>`;
    }

    let modal = $('pizza-customizer-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pizza-customizer-modal';
        document.body.appendChild(modal);
    }

    modal.className = 'fixed inset-0 z-[200] flex items-end sm:items-center justify-center opacity-0 transition-opacity duration-300';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onclick="closeCustomizer()"></div>
        <div id="customizer-sheet" class="relative bg-white dark:bg-[#1a1a1a] w-full sm:w-[500px] sm:rounded-3xl rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl translate-y-full transition-transform duration-300 glass-modal">
            <div class="flex items-center gap-4 p-5 shrink-0 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1a1a1a] z-10 rounded-t-3xl sm:rounded-3xl">
                <img id="cust-img" src="${itemInfo.image || ''}" alt="${itemInfo.name}" class="w-20 h-20 rounded-2xl object-cover shadow-sm" onerror="this.src='images/placeholder.png'" loading="lazy">
                <div class="flex-1">
                    <h3 id="cust-title" class="font-display font-black text-xl leading-tight">${itemInfo.name}</h3>
                    <p class="text-primary font-bold text-sm mt-0.5">${itemInfo.sizes[sizeIdx].label}</p>
                    <p id="cust-desc" class="text-xs text-textMutedLight dark:text-textMutedDark mt-1 line-clamp-2">${itemInfo.description || ''}</p>
                </div>
                <button onclick="closeCustomizer()" class="w-8 h-8 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-full transition-colors self-start text-gray-500">✕</button>
            </div>
            <div class="p-6 overflow-y-auto hide-scrollbar flex-grow">
                ${modsHtml}
            </div>
            <div class="p-4 border-t border-gray-100 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-[#1a1a1a] shrink-0 rounded-b-3xl">
                <button onclick="addCustomizedItem()" class="w-full bg-primary text-white font-bold py-4 px-6 rounded-2xl hover:bg-hover transition-all active:scale-95 shadow-glow flex justify-between items-center group">
                    <span>Добавить в корзину</span>
                    <span class="text-lg font-black bg-white/20 px-3 py-1 rounded-xl transition-colors group-hover:bg-white/30" id="cust-total">${customizerBasePrice.toFixed(2)} BYN</span>
                </button>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        const sheet = $('customizer-sheet');
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

window.updateCustomizerTotal = () => {
    let price = customizerBasePrice;
    document.querySelectorAll('.cust-mod-cb:checked').forEach(cb => {
        price += parseFloat(cb.dataset.modPrice) || 0;
    });
    const ct = $('cust-total');
    if (ct) ct.textContent = parseFloat(price).toFixed(2) + ' BYN';
};

window.addCustomizedItem = () => {
    if (!currentCustomizerItem) return;

    const modifierNames = [];
    const modifierIds = [];

    document.querySelectorAll('.cust-mod-cb:checked').forEach(cb => {
        modifierIds.push(parseInt(cb.dataset.modId));
        modifierNames.push(cb.dataset.modName);
    });

    const sizeIdx = selectedSizeIndex[currentCustomizerItem.id] || 0;
    const size = currentCustomizerItem.sizes[sizeIdx];

    cart.push({
        productSizeId: size.id,
        modifierIds,
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

    const badge = $('cart-badge');
    if (badge) {
        badge.classList.add('cart-bounce');
        setTimeout(() => badge.classList.remove('cart-bounce'), 400);
    }
};

// ── Upsells ──
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
            <img src="${item.image}" alt="${item.name}" class="w-12 h-12 mx-auto object-cover rounded-lg mb-2" loading="lazy">
            <p class="text-[10px] font-bold leading-tight line-clamp-2 min-h-[24px]">${item.name}</p>
            <div class="mt-2 text-primary text-[10px] font-bold">+ ${parseFloat(item.sizes[0].price).toFixed(2)} BYN</div>
        </div>
    `).join('');
}
