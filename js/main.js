// ============================================================
// Express Pizza — main.js (Module 4/4)
// ============================================================
// Boot logic, OTP flow, event wiring.
// Depends on: api.js, ui.js, cart.js (loaded first)
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {

    // ── Theme Toggle ──
    const htmlTag = document.documentElement;
    const themeToggleBtn = $('theme-toggle');
    const themeToggleMobile = $('theme-toggle-mobile');

    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlTag.setAttribute('data-theme', 'dark');
    }
    function toggleTheme() {
        const isDark = htmlTag.getAttribute('data-theme') === 'dark';
        htmlTag.setAttribute('data-theme', isDark ? 'light' : 'dark');
        localStorage.theme = isDark ? 'light' : 'dark';
    }
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (themeToggleMobile) themeToggleMobile.addEventListener('click', toggleTheme);

    // ── Immortal modal buttons (single global delegation) ──
    if (!window.__uiModalDelegationBound) {
        window.__uiModalDelegationBound = true;
        document.body.addEventListener('click', (e) => {
            const cartModal = document.getElementById('cart-modal') || document.getElementById('cart-sidebar');
            const profileModal = document.getElementById('profile-modal');

            // Открытие корзины
            if (e.target.closest('#cart-btn') || e.target.closest('.cart-btn') || e.target.closest('#floating-cart')) {
                if (typeof toggleCart === 'function') {
                    toggleCart(true);
                } else {
                    cartModal?.classList.remove('hidden');
                }
            }
            // Закрытие корзины
            if (e.target.closest('#close-cart') || e.target.closest('[data-action="close-cart"]') || e.target.closest('#back-to-menu') || e.target.closest('#cart-overlay')) {
                if (typeof toggleCart === 'function') {
                    toggleCart(false);
                } else {
                    cartModal?.classList.add('hidden');
                }
            }
            // Открытие профиля
            if (e.target.closest('#profile-btn') || e.target.closest('[onclick="handleProfileClick()"]')) {
                if (typeof openProfileModal === 'function') {
                    e.preventDefault();
                    openProfileModal();
                } else {
                    profileModal?.classList.remove('hidden');
                }
            }
            // Закрытие профиля
            if (e.target.closest('#close-profile') || e.target.closest('[onclick="closeProfileModal()"]')) {
                if (typeof closeProfileModal === 'function') {
                    closeProfileModal();
                } else {
                    profileModal?.classList.add('hidden');
                }
            }
        });
    }

    // ── OTP Flow ──
    const orderForm = $('order-form');
    let selectedPaymentMethod = 'cash';

    const paymentInputs = document.querySelectorAll('input[name="payment"]');
    paymentInputs.forEach(input => {
        if (input.checked) selectedPaymentMethod = input.value;
        input.addEventListener('change', () => {
            if (input.checked) selectedPaymentMethod = input.value;
        });
    });

    window.requestOTP = async () => {
        if (!orderForm.checkValidity()) {
            orderForm.reportValidity();
            return;
        }

        const email = $('user-email').value.trim().toLowerCase();
        const paymentMethod = document.querySelector('input[name="payment"]:checked');
        if (!paymentMethod) {
            showToast('error', 'Выберите способ оплаты');
            return;
        }

        const btn = $('btn-request-otp');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Отправка кода...'; }

        try {
            await api('/api/auth/send-email', {
                method: 'POST',
                body: JSON.stringify({ email }),
            });

            orderForm.classList.add('hidden');
            const otpStep = $('otp-step');
            if (otpStep) otpStep.classList.remove('hidden');
            const emailDisplay = $('otp-email-display');
            if (emailDisplay) emailDisplay.textContent = email;
            const otpInput = $('otp-input');
            if (otpInput) otpInput.focus();
        } catch (err) {
            console.error('[OTP] Send email error:', err);
            const backendDetails = err?.message || 'Ошибка отправки кода';
            alert(`Ошибка отправки кода: ${backendDetails}`);
            showToast('error', backendDetails);
            if (btn) { btn.disabled = false; btn.innerHTML = 'Оформить заказ'; }
        }
    };

    window.verifyOTPAndSubmit = async () => {
        const otpInput = $('otp-input');
        const code = otpInput ? otpInput.value : '';
        const email = $('user-email') ? $('user-email').value.trim().toLowerCase() : '';
        const customerPhone = $('user-phone') ? $('user-phone').value : '';
        const name = $('user-name') ? $('user-name').value : '';

        if (!code || code.length < 4) {
            showToast('error', 'Введите 4-значный код');
            return;
        }

        const verifyBtn = $('btn-verify-otp');
        if (verifyBtn) { verifyBtn.disabled = true; verifyBtn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Проверка...'; }

        try {
            const authResult = await api('/api/auth/verify', {
                method: 'POST',
                body: JSON.stringify({ email, code, name }),
            });

            authToken = authResult.token;
            try {
                localStorage.setItem('ep_auth_token', authToken);
            } catch (storageError) {
                console.warn('[Auth] Failed to persist auth token:', storageError);
            }

            // BACKDOOR WARNING
            if (authResult._backdoorUsed) {
                setTimeout(() => {
                    alert('🚨🚨🚨 ВЫ ВОШЛИ ПО БЭКДОРУ 1234! 🚨🚨🚨\n\n' +
                        'ВАЖНО: НЕ ЗАБУДЬТЕ УДАЛИТЬ ЕГО ИЗ КОДА ПЕРЕД РЕЛИЗОМ!\n\n' +
                        'Файл: server/src/routes/auth.js\n' +
                        'Ищите: isBackdoor\n\n' +
                        '🔴 ЭТО НЕ ШУТКА. УДАЛИТЕ БЭКДОР. 🔴');
                }, 500);
            }

            const address = $('user-address') ? $('user-address').value : '';
            const checkoutTotal = serverCalculation?.total || cart.reduce((sum, item) => sum + item.quantity * (parseFloat(item._display?.price) || 0), 0);

            if (selectedPaymentMethod === 'card') {
                await window.simulateSandboxCardPayment(checkoutTotal);
            }

            if (verifyBtn) verifyBtn.innerHTML = '<span class="animate-spin inline-block">⏳</span> Оформляем...';

            const payload = {
                items: cart.map(i => ({
                    productSizeId: i.productSizeId,
                    modifierIds: i.modifierIds || [],
                    quantity: i.quantity,
                })),
                promoCodeString: appliedPromoCode || undefined,
                customerName: name,
                customerAddress: address,
                payment: selectedPaymentMethod === 'card' ? 'BEPAID_ONLINE' : 'CASH_IKASSA',
                paymentMethod: selectedPaymentMethod,
                paymentStatus: selectedPaymentMethod === 'card' ? 'paid' : 'pending',
                transactionId: selectedPaymentMethod === 'card' ? 'sb_' + Date.now() : undefined,
                restaurantId: 1,
                clientOrderId: crypto.randomUUID(),
                customerPhone
            };

            const orderResult = await api('/api/orders/checkout', {
                method: 'POST',
                body: JSON.stringify(payload),
            });

            if (orderResult.offline) {
                showToast('success', '🌐 Нет сети. Ваш заказ сохранен и будет отправлен автоматически, как только появится интернет!', 5000);
            } else {
                showOrderTracker(orderResult.orderNumber || orderResult.orderId);

                if (orderResult.checkoutUrl) {
                    window.location.href = orderResult.checkoutUrl;
                    return;
                }

                if (typeof eventBus !== 'undefined') eventBus.emit('ORDER_PLACED', orderResult.order);

                // Telegram Notification (Removed from frontend)
                // Notifications are now handled purely on the backend via telegramService.js
                console.log('[Order] Checkout successful, backend will notify Telegram.');
            }

            // Reset
            cart = [];
            appliedPromoCode = null;
            serverCalculation = null;
            renderCartUI(null);

            setTimeout(() => {
                if (orderForm) { orderForm.reset(); orderForm.classList.remove('hidden'); }
                const otpStep = $('otp-step');
                if (otpStep) otpStep.classList.add('hidden');
                const reqBtn = $('btn-request-otp');
                if (reqBtn) { reqBtn.disabled = false; reqBtn.innerHTML = 'Оформить заказ'; }
                if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerHTML = '<span>Подтвердить и Заказать</span>'; }
                if (otpInput) otpInput.value = '';
            }, 1000);

        } catch (err) {
            showToast('error', err.message || 'Ошибка оформления заказа');
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerHTML = '<span>Подтвердить и Заказать</span>'; }
        }
    };

    // ── Boot ──
    showSkeletons();

    await Promise.all([fetchMenu(), fetchPromotions()]);

    if (typeof window.renderCategories === 'function') window.renderCategories(menuCategories);
    if (typeof window.renderPromotions === 'function') window.renderPromotions(promotions);
    renderMenu();
    debouncedRecalculate();
    setInterval(updateTimer, 60000);
    updateTimer();

    console.log('[Express Pizza] Modular app initialized ✓ (api.js + ui.js + cart.js + main.js)');
});

window.addEventListener('online', async () => {
    let offlineOrders = safeLocalStorageGetJson('offline_orders', []);
    if (!Array.isArray(offlineOrders) || offlineOrders.length === 0) return;

    showToast('success', 'Связь восстановлена! Отправляем сохраненные заказы...', 4000);
    let remainingOrders = [];

    for (const order of offlineOrders) {
        try {
            const tempId = order._tempId;
            delete order._tempId;

            const res = await fetch(`${API_BASE}/api/orders/checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken ? `Bearer ${authToken}` : ''
                },
                body: JSON.stringify(order)
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Sync Failed');
            
            showToast('success', `Ваш офлайн-заказ успешно отправлен на кухню!`);
            if (typeof eventBus !== 'undefined') eventBus.emit('ORDER_PLACED', data.order);
        } catch (e) {
            console.error('[Sync] Failed to sync order', e);
            order._tempId = tempId;
            remainingOrders.push(order);
        }
    }

    if (remainingOrders.length === 0) {
        try {
            localStorage.removeItem('offline_orders');
        } catch (storageError) {
            console.warn('[Sync] Failed to clean offline orders cache:', storageError);
        }
    } else {
        safeLocalStorageSetJson('offline_orders', remainingOrders);
    }
});
