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
    if (!cartSidebar || !cartOverlay || !cartPanel) return;

    if (show) {
        cartSidebar.classList.remove('hidden');
        cartSidebar.classList.remove('pointer-events-none');
        cartOverlay.classList.replace('opacity-0', 'opacity-100');
        cartOverlay.classList.add('pointer-events-auto');
        cartPanel.classList.replace('translate-y-full', 'translate-y-0');
        cartPanel.classList.replace('lg:translate-x-full', 'lg:translate-x-0');
        document.body.style.overflow = 'hidden';
        return;
    }

    cartOverlay.classList.replace('opacity-100', 'opacity-0');
    cartOverlay.classList.remove('pointer-events-auto');
    cartPanel.classList.replace('translate-y-0', 'translate-y-full');
    cartPanel.classList.replace('lg:translate-x-0', 'lg:translate-x-full');
    cartSidebar.classList.add('pointer-events-none');

    setTimeout(() => {
        cartSidebar.classList.add('hidden');
        document.body.style.overflow = '';
    }, 300);
}


function loadCart() {
    try {
        const raw = localStorage.getItem('ep_cart') ?? localStorage.getItem('cart');
        if (!raw) {
            cart = [];
            return;
        }

        const parsed = JSON.parse(raw);
        cart = Array.isArray(parsed) ? parsed : [];
        safeLocalStorageSetJson('ep_cart', cart);
    } catch (error) {
        console.warn('[Cart] Failed to parse saved cart. Resetting local state:', error);
        try {
            localStorage.removeItem('cart');
            localStorage.removeItem('ep_cart');
        } catch (storageError) {
            console.warn('[Cart] Failed to clear corrupted local storage state:', storageError);
        }
        cart = [];
    }
}

loadCart();

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
        promoCodeString: appliedPromoCode || undefined,
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
            const onlineRadio = document.querySelector('input[value="card"]');
            if (onlineRadio) {
                onlineRadio.checked = true;
                onlineRadio.dispatchEvent(new Event('change', { bubbles: true }));
            }
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
        try {
            cartItemsContainer.innerHTML = cart.length === 0
            ? `<div class="text-center py-12">
                    <div class="w-20 h-20 mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto text-gray-400">
                        <svg class="w-8 h-8 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                    </div>
                    <p class="text-textMutedLight dark:text-textMutedDark">Ваша корзина пуста</p>
                    <button type="button" data-action="close-cart" onclick="toggleCart(false);" class="mt-4 text-primary font-bold hover:underline">Вернуться в меню</button>
               </div>`
            : cart.map((item, idx) => {
                try {
                    const sd = displayItems[idx];
                    if (!item) {
                        return '';
                    }
                    const name = sd?.name || item._display.name;
                    const image = sd?.image || item._display.image;
                    const sizeLabel = sd?.sizeLabel || item._display.sizeLabel;
                    const mods = Array.isArray(sd?.modifiers) ? sd.modifiers.map((m) => m?.name).filter(Boolean) : (Array.isArray(item._display?.modifierNames) ? item._display.modifierNames : []);
                    const modsHtml = (item.modifiers && item.modifiers.length)
                        ? '<div style="font-size: 12px; color: #aaa; margin-top: 4px;">+ ' + item.modifiers.map(m => m.name).join(', ') + '</div>'
                        : (mods.length > 0
                            ? '<div style="font-size: 12px; color: #aaa; margin-top: 4px;">+ ' + mods.map((m) => escapeHtml(m)).join(', ') + '</div>'
                            : '');
                    const serverLinePrice = sd ? (Number(sd.unitPrice) * Number(sd.quantity || item.quantity || 1)) : null;
                    const localLinePrice = Number(item._meta?.finalPrice || 0) * Number(item.quantity || 1);
                    const linePrice = Number.isFinite(serverLinePrice) && serverLinePrice > 0
                        ? serverLinePrice
                        : (Number.isFinite(localLinePrice) ? localLinePrice : null);

                    const imageSrc = window.resolveMenuItemImage({
                        name,
                        image,
                        categorySlug: item?._meta?.categorySlug,
                    });
                    const imageHtml = imageSrc
                        ? `<img src="${imageSrc}" alt="${name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px;" class="bg-gray-50 dark:bg-gray-900 flex-shrink-0 shadow-sm border border-gray-100 dark:border-gray-800" loading="lazy" onerror="this.onerror=null;this.src='/images/icon.jpg'">`
                        : `<div class="w-[50px] h-[50px] rounded-[8px] bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 flex-shrink-0 shadow-sm"><svg class="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`;

                    return `
                <div class="flex items-center gap-4 animate-fade-in group relative">
                    ${imageHtml}
                    <div class="flex-grow min-w-0 pr-2">
                        <h4 class="font-bold text-sm mb-0.5 truncate flex items-center gap-1.5"><span class="cart-item-icon" aria-hidden="true">🍕</span><span class="truncate">${escapeHtml(name)}</span></h4>
                        <div class="flex flex-col gap-0.5">
                            ${sizeLabel ? `<span class="text-[11px] text-textMutedLight dark:text-textMutedDark">${escapeHtml(sizeLabel)}</span>` : ''}
                            ${modsHtml}
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
                } catch (itemError) {
                    console.warn('[Cart] Skipping broken cart item while rendering:', itemError, item);
                    return '';
                }
            }).join('');
        } catch (e) {
            console.error(e);
        }
    }

    // Totals area
    const totalsArea = $('cart-totals-area');
    if (totalsArea) {
        const localSubtotal = cart.reduce((sum, item) => {
            const itemQty = Number(item.quantity || 0);
            const unit = Number(item._meta?.finalPrice || item._display?.price || 0);
            return sum + (Number.isFinite(unit) ? unit * itemQty : 0);
        }, 0);
        const subtotal = Number(serverData?.subtotal ?? localSubtotal);
        const discount = Number(serverData?.discount ?? 0);
        const total = Number(serverData?.total ?? subtotal);
        const promo = serverData?.promo || null;

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
    }

    safeLocalStorageSetJson('ep_cart', cart);
}

function normalizeModifierIds(modifierIds = []) {
    return [...modifierIds]
        .map((id) => String(id).trim())
        .filter(Boolean)
        .sort();
}

function addCartLine(itemPayload) {
    const normalizedModifierIds = normalizeModifierIds(itemPayload.modifierIds || []);
    const normalizedPrice = Number(itemPayload.finalPrice || 0);
    const existing = cart.find((entry) => {
        const sameSize = entry.productSizeId === itemPayload.productSizeId;
        const sameDough = (entry._meta?.doughType || 'traditional') === (itemPayload.doughType || 'traditional');
        const sameModifiers = JSON.stringify(normalizeModifierIds(entry.modifierIds || [])) === JSON.stringify(normalizedModifierIds);
        return sameSize && sameDough && sameModifiers;
    });

    if (existing) {
        existing.quantity += 1;
        return;
    }

    cart.push({
        cartItemId: itemPayload.cartItemId || (Date.now() + Math.random()),
        productSizeId: itemPayload.productSizeId,
        modifierIds: normalizedModifierIds,
        quantity: 1,
        _display: {
            name: itemPayload.name,
            image: itemPayload.image,
            sizeLabel: itemPayload.sizeLabel,
            weight: itemPayload.weight,
            modifierNames: itemPayload.modifierNames || [],
        },
        _meta: {
            itemId: itemPayload.itemId,
            doughType: itemPayload.doughType || 'traditional',
            finalPrice: Number.isFinite(normalizedPrice) ? normalizedPrice : 0,
            categorySlug: itemPayload.categorySlug || '',
        },
    });
}

window.cart = {
    addItem(itemPayload) {
        if (!itemPayload) {
            throw new Error('Invalid cart payload');
        }

        const normalizedPayload = itemPayload.productSizeId
            ? itemPayload
            : {
                itemId: itemPayload.id,
                productSizeId: itemPayload.productSizeId || itemPayload.sizeId,
                sizeLabel: itemPayload.size || itemPayload.sizeLabel || '',
                doughType: itemPayload.dough || itemPayload.doughType || 'traditional',
                modifierIds: (itemPayload.modifiers || []).map((mod) => mod.id),
                name: itemPayload.name,
                image: itemPayload.image,
                weight: itemPayload.weight,
                modifierNames: (itemPayload.modifiers || []).map((mod) => mod.name).filter(Boolean),
                finalPrice: Number(itemPayload.price || itemPayload.finalPrice || 0),
                categorySlug: itemPayload.categorySlug,
            };

        if (!normalizedPayload.productSizeId) {
            throw new Error('Invalid cart payload: productSizeId is required');
        }

        normalizedPayload.cartItemId = Date.now() + Math.random();
        addCartLine(normalizedPayload);
        safeLocalStorageSetJson('ep_cart', cart);
        debouncedRecalculate();
    },
};

// ── Add to Cart ──
window.addToCart = (id) => {
    const item = db.getMenuItem(id);
    if (!item) return;

    if (item.isAvailable === false) {
        showToast('error', 'Позиция временно недоступна (стоп-лист)');
        return;
    }

    const isPizza = (item.categorySlug || '').toLowerCase().includes('pizza') || (item.categoryName || '').toLowerCase().includes('пиц');
    if (isPizza || (item.modifiers && item.modifiers.length > 0) || (item.dodoModifiers && item.dodoModifiers.length > 0)) {
        openCustomizer(id);
        return;
    }

    const sizeIdx = selectedSizeIndex[id] || 0;
    const size = item.sizes?.[sizeIdx] || item.sizes?.[0];

    if (!size?.id) {
        showToast('error', 'Размер товара недоступен');
        return;
    }

    window.cart.addItem({
        itemId: item.id,
        productSizeId: size.id,
        sizeLabel: size.label,
        doughType: 'traditional',
        modifierIds: [],
        name: item.name,
        image: item.image,
        weight: size.weight,
        modifierNames: [],
        finalPrice: Number.isFinite(Number(size.price)) ? Number(size.price) : 0,
        categorySlug: item.categorySlug,
    });

    // Bounce animation on cart badge
    const badge = $('cart-badge');
    if (badge) {
        badge.classList.add('cart-bounce');
        setTimeout(() => badge.classList.remove('cart-bounce'), 400);
    }

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
let customizerState = { sizeIdx: 0, doughType: 'traditional' };

window.openCustomizer = (itemId) => {
    const itemInfo = db.getMenuItem(itemId);
    if (!itemInfo) return;

    currentCustomizerItem = itemInfo;
    customizerState.sizeIdx = selectedSizeIndex[itemId] || 0;
    customizerState.doughType = 'traditional';

    const size = itemInfo.sizes[customizerState.sizeIdx] || itemInfo.sizes[0];
    if (!size) return;
    customizerBasePrice = parseFloat(size.price) || 0;

    const modifiers = Array.isArray(itemInfo.dodoModifiers) && itemInfo.dodoModifiers.length
        ? itemInfo.dodoModifiers
        : (itemInfo.modifiers || []);

    const grouped = modifiers.reduce((acc, mod) => {
        const key = mod.category || mod.groupName || 'добавка';
        if (!acc[key]) acc[key] = [];
        acc[key].push(mod);
        return acc;
    }, {});

    const sizesHtml = itemInfo.sizes.map((s, i) => `
        <label class="segment-option ${i === customizerState.sizeIdx ? 'is-active' : ''}">
            <input type="radio" name="cust-size" value="${i}" ${i === customizerState.sizeIdx ? 'checked' : ''} onchange="setCustomizerSize(${i})">
            <span>${s.label}</span>
        </label>
    `).join('');

    const modsHtml = Object.keys(grouped).length === 0
        ? '<p class="text-sm text-textMutedLight dark:text-textMutedDark">Дополнительные модификаторы скоро появятся.</p>'
        : Object.entries(grouped).map(([group, mods]) => `
            <div class="mb-5 last:mb-0">
                <p class="text-xs font-bold uppercase tracking-wider text-textMutedLight dark:text-textMutedDark mb-2">${group}</p>
                <div class="modifiers-grid">
                    ${mods.map((m) => `
                        <label class="modifier-card">
                            <input type="checkbox" class="cust-mod-cb" data-mod-id="${m.id}" data-mod-price="${m.price}" data-mod-name="${m.name}" onchange="updateCustomizerTotal()">
                            <div class="card-content modifier-card-inner">
                                <span class="modifier-checkmark">✓</span>
                                <img src="${window.resolveModifierImage(m)}" class="modifier-image" alt="${m.name}" onerror="this.onerror=null;this.src='/images/icon.jpg'">
                                <span class="name">${m.name}</span>
                                <span class="price">+ ${parseFloat(m.price || 0).toFixed(2)} BYN</span>
                                <span class="tap-hint">Нажмите, чтобы добавить</span>
                            </div>
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('');

    const modal = $('pizza-customizer-modal');
    const sheet = $('customizer-sheet');
    if (!modal || !sheet) return;

    modal.classList.add('items-end', 'sm:items-center', 'sm:justify-center');
    sheet.className = 'relative bg-white dark:bg-[#1a1a1a] w-full sm:w-[780px] sm:rounded-3xl rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl translate-y-full transition-transform duration-300 glass-modal';
    sheet.innerHTML = `
            <div class="grid md:grid-cols-2 gap-0 flex-grow overflow-y-auto hide-scrollbar">
                <div class="p-5 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800">
                    <img src="${window.resolveMenuItemImage(itemInfo)}" alt="${itemInfo.name}" class="w-full aspect-square object-cover rounded-2xl mb-4" onerror="this.onerror=null;this.src='/images/icon.jpg'">
                    <h3 class="font-display font-black text-2xl leading-tight">${itemInfo.name}</h3>
                    <p class="text-sm text-textMutedLight dark:text-textMutedDark mt-1">${itemInfo.description || ''}</p>
                </div>
                <div class="p-5">
                    <div class="mb-5">
                        <p class="font-bold mb-2">Размер</p>
                        <div class="segmented-control">${sizesHtml}</div>
                    </div>
                    <div class="mb-5">
                        <p class="font-bold mb-2">Тип теста</p>
                        <div class="segmented-control">
                            <label class="segment-option is-active" id="dough-traditional">
                                <input type="radio" name="cust-dough" checked onchange="setCustomizerDough('traditional')">
                                <span>Традиционное</span>
                            </label>
                            <label class="segment-option" id="dough-thin">
                                <input type="radio" name="cust-dough" onchange="setCustomizerDough('thin')">
                                <span>Тонкое</span>
                            </label>
                        </div>
                    </div>
                    <div>
                        <p class="font-bold mb-3">Добавить по вкусу</p>
                        ${modsHtml}
                    </div>
                </div>
            </div>
            <div class="p-4 border-t border-gray-100 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-[#1a1a1a] shrink-0 rounded-b-3xl">
                <button onclick="addCustomizedItem()" class="w-full bg-primary text-white font-bold py-4 px-6 rounded-2xl hover:bg-hover transition-all active:scale-95 shadow-glow flex justify-between items-center group">
                    <span>В корзину</span>
                    <span class="text-lg font-black bg-white/20 px-3 py-1 rounded-xl" id="cust-total">${customizerBasePrice.toFixed(2)} BYN</span>
                </button>
            </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        sheet.classList.remove('translate-y-full');
    });
    updateCustomizerTotal();
};

window.setCustomizerSize = (idx) => {
    if (!currentCustomizerItem) return;
    customizerState.sizeIdx = idx;
    customizerBasePrice = parseFloat(currentCustomizerItem.sizes[idx]?.price || 0);

    document.querySelectorAll('.segment-option input[name="cust-size"]').forEach((input, inputIdx) => {
        const active = Number(inputIdx) === Number(idx);
        input.checked = active;
        input.closest('.segment-option')?.classList.toggle('is-active', active);
    });

    updateCustomizerTotal();
};

window.setCustomizerDough = (type) => {
    customizerState.doughType = type;
    $('dough-traditional')?.classList.toggle('is-active', type === 'traditional');
    $('dough-thin')?.classList.toggle('is-active', type === 'thin');
    const doughInput = (type === 'traditional' ? $('dough-traditional') : $('dough-thin'))?.querySelector('input');
    if (doughInput) doughInput.checked = true;
};

window.closeCustomizer = () => {
    const modal = $('pizza-customizer-modal');
    const sheet = $('customizer-sheet');
    if (modal) modal.classList.add('opacity-0');
    if (sheet) sheet.classList.add('translate-y-full');
    setTimeout(() => {
        if (modal) modal.classList.add('hidden');
    }, 300);
};

window.updateCustomizerTotal = () => {
    let price = customizerBasePrice;

    document.querySelectorAll('.cust-mod-cb').forEach((cb) => {
        const card = cb.closest('.modifier-card');
        if (card) {
            card.classList.toggle('active', cb.checked);
        }

        if (cb.checked) {
            price += parseFloat(cb.dataset.modPrice) || 0;
        }
    });

    const ct = $('cust-total');
    if (ct) ct.textContent = `${price.toFixed(2)} BYN`;
};

window.addCustomizedItem = () => {
    if (!currentCustomizerItem) return;

    const selectedModifiers = [];
    const modifierNames = [];
    const modifierIds = [];
    document.querySelectorAll('.cust-mod-cb:checked').forEach((cb) => {
        const modifierId = parseInt(cb.dataset.modId, 10);
        const modifierName = cb.dataset.modName;
        modifierIds.push(modifierId);
        modifierNames.push(modifierName);
        selectedModifiers.push({
            id: modifierId,
            name: modifierName,
            price: parseFloat(cb.dataset.modPrice || 0),
        });
    });

    const size = currentCustomizerItem.sizes[customizerState.sizeIdx] || currentCustomizerItem.sizes[0];
    if (!size) return;

    const finalPriceLabel = $('cust-total')?.textContent || '';
    const parsedPrice = parseFloat(finalPriceLabel.replace(/[^\d.]/g, ''));
    const finalPrice = parseFloat(parsedPrice) || parseFloat(customizerBasePrice) || 0;

    const item = {
        id: currentCustomizerItem.id || Date.now(),
        productSizeId: size.id,
        sizeId: size.id,
        name: currentCustomizerItem.name,
        price: finalPrice,
        finalPrice,
        size: size.label,
        sizeLabel: `${size.label}, ${customizerState.doughType === 'thin' ? 'Тонкое' : 'Традиционное'}`,
        dough: customizerState.doughType,
        doughType: customizerState.doughType,
        modifiers: selectedModifiers,
        modifierIds,
        image: currentCustomizerItem.image || '',
        weight: size.weight,
        modifierNames,
        categorySlug: currentCustomizerItem.categorySlug,
    };

    try {
        window.cart.addItem(item);
    } catch (error) {
        console.error('[Cart] Failed to add customized item:', error, item);
        showToast('error', 'Не удалось добавить товар в корзину. Попробуйте снова.');
        return;
    }

    renderCartUI(serverCalculation);

    closeCustomizer();
    showToast('success', `${currentCustomizerItem.name} добавлена в корзину!`);
    const badge = $('cart-badge');
    if (badge) {
        badge.classList.add('cart-bounce');
        setTimeout(() => badge.classList.remove('cart-bounce'), 400);
    }
};

window.simulateSandboxCardPayment = (total) => new Promise((resolve) => {
    let modal = $('sandbox-payment-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'sandbox-payment-modal';
        document.body.appendChild(modal);
    }

    const parsedTotal = Number(total || 0);
    const amount = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal.toFixed(2) : '0.00';

    modal.className = 'fixed inset-0 z-[300] flex items-center justify-center opacity-0 transition-opacity duration-300';
    modal.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        <div class="relative bg-white dark:bg-[#1a1a1a] rounded-3xl w-[92%] max-w-md p-5 shadow-2xl">
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-display font-black text-xl">Sandbox Payment Gateway</h3>
                <span class="text-xs text-textMutedLight dark:text-textMutedDark">TEST MODE</span>
            </div>

            <div class="space-y-3">
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
                    <label for="sandbox-card-number" style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold;">Номер карты</label>
                    <input id="sandbox-card-number" maxlength="19" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" style="border: none; border-bottom: 2px solid #e2e8f0; background: transparent; font-size: 16px; padding: 8px 0; outline: none; transition: 0.3s; width: 100%; color: #111827; caret-color: #ef4444;" class="sandbox-pay-field font-mono">

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label for="sandbox-card-exp" style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold;">Срок</label>
                            <input id="sandbox-card-exp" maxlength="5" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" style="border: none; border-bottom: 2px solid #e2e8f0; background: transparent; font-size: 16px; padding: 8px 0; outline: none; transition: 0.3s; width: 100%; color: #111827; caret-color: #ef4444;" class="sandbox-pay-field font-mono">
                        </div>
                        <div>
                            <label for="sandbox-card-cvc" style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: bold;">CVC</label>
                            <input id="sandbox-card-cvc" maxlength="3" inputmode="numeric" autocomplete="cc-csc" placeholder="123" style="border: none; border-bottom: 2px solid #e2e8f0; background: transparent; font-size: 16px; padding: 8px 0; outline: none; transition: 0.3s; width: 100%; color: #111827; caret-color: #ef4444;" class="sandbox-pay-field font-mono">
                        </div>
                    </div>
                </div>
            </div>

            <button id="sandbox-pay-btn" class="w-full mt-5 bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg">Оплатить ${amount} BYN</button>
            <div id="sandbox-bank-status" class="hidden mt-3 text-sm text-center text-textMutedLight dark:text-textMutedDark">
                <span class="animate-spin inline-block mr-2">⏳</span>Связь с банком...
            </div>
        </div>
    `;

    requestAnimationFrame(() => modal.classList.remove('opacity-0'));

    const payBtn = $('sandbox-pay-btn');
    const bankStatus = $('sandbox-bank-status');
    const cardNumberInput = $('sandbox-card-number');
    const cardExpInput = $('sandbox-card-exp');
    const cardCvcInput = $('sandbox-card-cvc');

    const applyFocusStyle = (el) => {
        if (!el) return;
        el.addEventListener('focus', () => {
            el.style.borderBottomColor = '#ff6900';
        });
        el.addEventListener('blur', () => {
            el.style.borderBottomColor = '#e2e8f0';
        });
        if (document.documentElement.getAttribute('data-theme') === 'dark') {
            el.style.color = '#f8fafc';
            el.style.borderBottomColor = '#334155';
        }
    };

    if (cardNumberInput) {
        cardNumberInput.removeAttribute('readonly');
        cardNumberInput.removeAttribute('disabled');
        cardNumberInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            v = v.slice(0, 16);
            e.target.value = v.replace(/(.{4})/g, '$1 ').trim();
        });
        applyFocusStyle(cardNumberInput);
    }

    if (cardExpInput) {
        cardExpInput.removeAttribute('readonly');
        cardExpInput.removeAttribute('disabled');
        cardExpInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '');
            if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2, 4);
            e.target.value = v.slice(0, 5);
        });
        applyFocusStyle(cardExpInput);
    }

    if (cardCvcInput) {
        cardCvcInput.removeAttribute('readonly');
        cardCvcInput.removeAttribute('disabled');
        cardCvcInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
        });
        applyFocusStyle(cardCvcInput);
    }

    if (!payBtn) return resolve();

    payBtn.addEventListener('click', () => {
        const cardNumber = (cardNumberInput?.value || '').replace(/\s/g, '');
        const exp = cardExpInput?.value || '';
        const cvc = cardCvcInput?.value || '';

        if (cardNumber.length < 16 || exp.length < 5 || cvc.length < 3) {
            showToast('error', 'Введите корректные реквизиты карты');
            return;
        }

        payBtn.disabled = true;
        if (bankStatus) bankStatus.classList.remove('hidden');

        setTimeout(() => {
            modal.classList.add('opacity-0');
            setTimeout(() => {
                modal.classList.add('hidden');
                resolve();
            }, 250);
        }, 2500);
    });
});

// ── Upsells ──
function renderUpsells() {
    const widget = $('upsell-widget');
    const container = $('upsell-container');
    if (!widget || !container) return;

    const menu = db.getMenu();
    const cartMenuItems = cart
        .map(cartItem => menu.find(menuItem => menuItem.sizes?.some(size => size.id === cartItem.productSizeId)))
        .filter(Boolean);

    const hasPizza = cartMenuItems.some(item => ['pizza', 'pizzas'].includes(item.category));
    const hasDrinks = cartMenuItems.some(item => item.category === 'drinks');
    const hasSnacks = cartMenuItems.some(item => ['snack', 'snacks'].includes(item.category));
    const hasSauces = cartMenuItems.some(item => ['sauce', 'sauces'].includes(item.category));

    const popularFallback = [
        ...db.getAvailableMenu('drinks'),
        ...db.getAvailableMenu('sauce'),
        ...db.getAvailableMenu('snacks'),
    ];

    let upsells = [];
    if (hasPizza && !hasDrinks) {
        upsells = db.getAvailableMenu('drinks');
    } else if (hasSnacks && !hasSauces) {
        upsells = db.getAvailableMenu('sauce');
    } else {
        upsells = popularFallback;
    }

    upsells = upsells
        .filter((item, idx, arr) => arr.findIndex(i => i.id === item.id) === idx)
        .filter(item => !cartMenuItems.some(cartItem => cartItem.id === item.id))
        .slice(0, 3);

    if (upsells.length === 0) { widget.classList.add('hidden'); return; }

    widget.classList.remove('hidden');
    container.innerHTML = upsells.map(item => {
        const imageSrc = window.resolveMenuItemImage(item);
        return `
        <div class="upsell-card flex-shrink-0 w-28 bg-white dark:bg-bgElementDark rounded-xl p-2 border border-gray-100 dark:border-gray-800 shadow-sm text-center hover:border-primary transition-colors">
            <img src="${imageSrc}" alt="${escapeHtml(item.name)}" class="upsell-card-image mx-auto mb-1.5" loading="lazy" onerror="this.onerror=null;this.src='/images/icon.jpg'">
            <p class="text-[10px] font-bold leading-tight line-clamp-2 min-h-[24px]">${escapeHtml(item.name)}</p>
            <div class="mt-1 text-primary text-[10px] font-bold">+ ${parseFloat(item.sizes?.[0]?.price || 0).toFixed(2)} BYN</div>
            <button type="button" class="upsell-add-btn mt-1.5" onclick="addToCart(${item.id}); event.stopPropagation();">+ Добавить</button>
        </div>
    `}).join('');
}
