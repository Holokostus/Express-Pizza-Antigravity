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

    // ── Category Tabs ──
    document.querySelectorAll('.menu-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.menu-tab').forEach(t => {
                t.classList.remove('active', 'bg-red-600', 'bg-primary', 'text-white', 'shadow-glow-red');
                t.classList.add('bg-gray-100', 'dark:bg-gray-800');
            });
            tab.classList.remove('bg-gray-100', 'dark:bg-gray-800');
            tab.classList.add('active', 'bg-red-600', 'text-white', 'shadow-glow-red');
            currentCategory = tab.dataset.category;
            renderMenu();
        });
    });

    // ── Cart Sidebar Events ──
    const floatingCart = $('floating-cart');
    const closeCartBtn = $('close-cart');
    const cartOverlay = $('cart-overlay');

    if (floatingCart) floatingCart.addEventListener('click', () => toggleCart(true));
    if (closeCartBtn) closeCartBtn.addEventListener('click', () => toggleCart(false));
    if (cartOverlay) cartOverlay.addEventListener('click', () => toggleCart(false));

    // ── OTP Flow ──
    const orderForm = $('order-form');

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
            if (btn) { btn.disabled = false; btn.innerHTML = 'Оформить заказ'; }
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
            const authResult = await api('/api/auth/verify', {
                method: 'POST',
                body: JSON.stringify({ phone, code, name }),
            });

            authToken = authResult.token;
            localStorage.setItem('ep_auth_token', authToken);

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

            showOrderTracker(orderResult.orderNumber || orderResult.orderId);

            if (orderResult.checkoutUrl) {
                window.location.href = orderResult.checkoutUrl;
                return;
            }

            if (typeof eventBus !== 'undefined') eventBus.emit('ORDER_PLACED', orderResult.order);

            // Telegram Notification (Removed from frontend)
            // Notifications are now handled purely on the backend via telegramService.js
            console.log('[Order] Checkout successful, backend will notify Telegram.');

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

    await fetchMenu();

    renderMenu();
    debouncedRecalculate();
    setInterval(updateTimer, 60000);
    updateTimer();

    console.log('[Express Pizza] Modular app initialized ✓ (api.js + ui.js + cart.js + main.js)');
});
