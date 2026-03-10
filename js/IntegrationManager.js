// ============================================================
// Express Pizza — Integration Hub (Adapter Pattern + Event Bus)
// ============================================================

// ---- Event Bus (Pub/Sub) ----
class EventBus {
    constructor() {
        this._listeners = {};
    }

    on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    }

    emit(event, data) {
        console.log(`%c[EventBus] ${event}`, 'color:#FFED00;font-weight:bold', data);
        (this._listeners[event] || []).forEach(h => {
            try { h(data); } catch (e) { console.error(`[EventBus] Handler error for ${event}:`, e); }
        });
    }
}

// ---- Adapter Base ----
class BaseAdapter {
    constructor(id, name) {
        this.id = id;
        this.name = name;
    }
    /** @param {Object} order - StandardOrderObject */
    sendOrder(order) { console.log(`[${this.name}] sendOrder — not implemented`); }
    /** @param {number} itemId  @param {boolean} available */
    syncStopList(itemId, available) { console.log(`[${this.name}] syncStopList — not implemented`); }
    /** @param {Object} config - adapter-specific config (apiKey, etc.) */
    configure(config) { console.log(`[${this.name}] configured`, config); }
}

// ---- Concrete Adapters ----

class TelegramAdapter extends BaseAdapter {
    constructor() { super('telegram', 'Telegram Bot'); }
    sendOrder(order) {
        console.log(`%c[Telegram Bot] 📲 Sending order #${order.id} to manager chat`, 'color:#26A5E4;font-weight:bold');
        // In production, this calls sendOrderToTelegram() from telegram.js
        if (typeof sendOrderToTelegram === 'function') {
            const td = {
                name: order.customer?.name || '',
                phone: order.customer?.phone || '',
                address: order.customer?.address || '',
                payment: order.payment,
                promo: order.promo,
                items: order.items
            };
            sendOrderToTelegram(td);
        }
    }
    syncStopList(itemId, available) {
        console.log(`[Telegram Bot] Stop-list update: item #${itemId} → ${available ? 'available' : 'disabled'}`);
    }
}

class IikoAdapter extends BaseAdapter {
    constructor() { super('iiko', 'iikoCloud POS'); }
    sendOrder(order) {
        console.log(`%c[iikoCloud] 🏪 POST /api/1/deliveries/create — Order #${order.id}`, 'color:#FF6B00;font-weight:bold');
        console.log(`[iikoCloud] Items: ${order.items.map(i => i.name).join(', ')}`);
        console.log(`[iikoCloud] → Response: { status: "accepted", iikoId: "IIKO-${order.id}-${Date.now()}" }`);
    }
    syncStopList(itemId, available) {
        console.log(`%c[iikoCloud] 🏪 Syncing stop-list: item #${itemId} → ${available ? 'ACTIVE' : 'STOPPED'}`, 'color:#FF6B00');
    }
}

class RkeeperAdapter extends BaseAdapter {
    constructor() { super('rkeeper', 'r_keeper POS'); }
    sendOrder(order) {
        console.log(`%c[r_keeper] 🖥️ XML-RPC call — Creating order #${order.id}`, 'color:#0066CC;font-weight:bold');
        console.log(`[r_keeper] Station: CashStation_01, Waiter: API_USER`);
        console.log(`[r_keeper] → Response: { orderId: "RK-${order.id}", status: "created" }`);
    }
    syncStopList(itemId, available) {
        console.log(`%c[r_keeper] 🖥️ Dish availability update: item #${itemId} → ${available ? 'ON' : 'OFF'}`, 'color:#0066CC');
    }
}

class BePaidAdapter extends BaseAdapter {
    constructor() { super('bepaid', 'bePaid Acquiring'); }
    sendOrder(order) {
        const total = order.items.reduce((s, i) => s + i.price * i.quantity, 0);
        console.log(`%c[bePaid] 💳 POST /ctp/api/checkouts — ${total.toFixed(2)} BYN`, 'color:#00B894;font-weight:bold');
        console.log(`[bePaid] → Checkout token: "BP-CHK-${Date.now()}", redirect URL generated`);
    }
    syncStopList() { /* Payment gateway doesn't need stop-list */ }
}

class YandexGoAdapter extends BaseAdapter {
    constructor() { super('yandex_go', 'Yandex.Go (Eats)'); }
    sendOrder(order) {
        console.log(`%c[Yandex.Go] 🚀 PATCH /api/v1/menu/availability — syncing order #${order.id}`, 'color:#FC3F1D;font-weight:bold');
    }
    syncStopList(itemId, available) {
        console.log(`%c[Yandex.Go] 🚀 ${available ? 'Resuming' : 'Pausing'} Item #${itemId} on Yandex.Eats`, 'color:#FC3F1D;font-weight:bold');
    }
}

class DelivioAdapter extends BaseAdapter {
    constructor() { super('delivio', 'Delivio'); }
    sendOrder(order) {
        console.log(`%c[Delivio] 📦 Webhook POST — New order #${order.id}`, 'color:#8E44AD;font-weight:bold');
    }
    syncStopList(itemId, available) {
        console.log(`%c[Delivio] 📦 Menu sync: item #${itemId} → ${available ? 'visible' : 'hidden'}`, 'color:#8E44AD');
    }
}

class SlivkiAdapter extends BaseAdapter {
    constructor() { super('slivki', 'Slivki.by'); }
    sendOrder(order) {
        if (order.promo) {
            console.log(`%c[Slivki.by] 🏷️ POST /api/v1/promo/redeem — code "${order.promo}" for order #${order.id}`, 'color:#E67E22;font-weight:bold');
        }
    }
    syncStopList(itemId, available) {
        console.log(`[Slivki.by] Partner menu update: item #${itemId} → ${available ? 'active' : 'paused'}`);
    }
}

// ---- Integration Manager (Singleton) ----
class IntegrationManager {
    constructor(eventBus) {
        this.bus = eventBus;
        this.STORAGE_KEY = 'ep_integrations';

        // Register all adapters
        this.adapters = {
            telegram: new TelegramAdapter(),
            iiko: new IikoAdapter(),
            rkeeper: new RkeeperAdapter(),
            bepaid: new BePaidAdapter(),
            yandex_go: new YandexGoAdapter(),
            delivio: new DelivioAdapter(),
            slivki: new SlivkiAdapter(),
        };

        // Default configuration
        if (!localStorage.getItem(this.STORAGE_KEY)) {
            const defaults = {};
            Object.keys(this.adapters).forEach(id => {
                defaults[id] = { enabled: id === 'telegram', apiKey: '' };
            });
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(defaults));
        }

        // Subscribe to events
        this.bus.on('ORDER_PLACED', (order) => this._routeOrder(order));
        this.bus.on('STOP_LIST_UPDATED', (data) => this._routeStopList(data));
    }

    getAll() {
        return JSON.parse(localStorage.getItem(this.STORAGE_KEY)) || {};
    }

    getConfig(id) {
        return this.getAll()[id] || { enabled: false, apiKey: '' };
    }

    setConfig(id, config) {
        const all = this.getAll();
        all[id] = { ...all[id], ...config };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(all));
    }

    enable(id) {
        this.setConfig(id, { enabled: true });
        console.log(`%c[IntegrationManager] ✅ ${this.adapters[id]?.name || id} ENABLED`, 'color:#22c55e;font-weight:bold');
    }

    disable(id) {
        this.setConfig(id, { enabled: false });
        console.log(`%c[IntegrationManager] ❌ ${this.adapters[id]?.name || id} DISABLED`, 'color:#ef4444;font-weight:bold');
    }

    isEnabled(id) {
        return this.getConfig(id).enabled === true;
    }

    _routeOrder(order) {
        const configs = this.getAll();
        const enabled = Object.keys(configs).filter(id => configs[id].enabled && this.adapters[id]);
        console.log(`%c[IntegrationManager] Routing order #${order.id} to ${enabled.length} adapter(s): ${enabled.join(', ')}`, 'color:#FFED00;font-weight:bold');
        enabled.forEach(id => this.adapters[id].sendOrder(order));
    }

    _routeStopList({ itemId, available }) {
        const configs = this.getAll();
        const enabled = Object.keys(configs).filter(id => configs[id].enabled && this.adapters[id]);
        console.log(`%c[IntegrationManager] Stop-list event for item #${itemId} → ${enabled.length} adapter(s)`, 'color:#FFED00');
        enabled.forEach(id => this.adapters[id].syncStopList(itemId, available));
    }
}

// ---- Global Instances ----
const eventBus = new EventBus();
const integrations = new IntegrationManager(eventBus);
