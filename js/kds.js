// Clock
setInterval(() => {
    const now = new Date();
    document.getElementById('clock').textContent = now.toLocaleTimeString('ru-RU');
    document.getElementById('date').textContent = now.toLocaleDateString('ru-RU');
}, 1000);

let ws = null;
let orders = [];

function normalizeStatus(order) {
    const rawStatus = String(order.status || '').toUpperCase();
    if (rawStatus === 'PAID' || rawStatus === 'CONFIRMED') {
        return 'NEW';
    }
    return rawStatus;
}

function initKDS() {
    fetch('/api/kds/1/orders')
        .then(res => res.json())
        .then(data => {
            orders = data;
            renderBoard();
        })
        .catch(err => console.error('Failed to fetch orders:', err));

    connectWS();
}

function getWsUrl() {
    return (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'ws://localhost:5000'
        : `wss://${window.location.host}`) + '/ws/kds';
}

function connectWS() {
    ws = new WebSocket(`${getWsUrl()}?restaurantId=1`);

    ws.onopen = () => {
        const statusEl = document.getElementById('ws-status');
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-sm font-bold';
        statusEl.innerHTML = '<div class="w-2 h-2 rounded-full bg-green-500"></div> В сети';
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'NEW_ORDER') {
            const order = msg.data;
            const idx = orders.findIndex(o => o.id === order.id);
            if (idx === -1) {
                orders.push(order);
            } else {
                orders[idx] = { ...orders[idx], ...order };
            }

            if (ws && ws.readyState === WebSocket.OPEN && order?.id) {
                ws.send(JSON.stringify({ type: 'KDS_ACK', orderId: order.id }));
            }
            renderBoard();
            return;
        }

        if (msg.type === 'STATUS_SYNC') {
            const idx = orders.findIndex(o => o.id === msg.data.orderId);
            if (idx !== -1) {
                orders[idx].status = msg.data.status;
                renderBoard();
            }
        }
    };

    ws.onclose = () => {
        const statusEl = document.getElementById('ws-status');
        statusEl.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm font-bold';
        statusEl.innerHTML = '<div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div> Переподключение...';
        setTimeout(connectWS, 3000);
    };
}

function changeStatus(orderId, newStatus) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'STATUS_UPDATE',
            data: { orderId, status: newStatus }
        }));
    }

    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
        orders[idx].status = newStatus;
        renderBoard();
    }
}

function renderBoard() {
    const cols = { NEW: [], COOKING: [], BAKING: [] };

    orders.forEach(o => {
        const normalized = normalizeStatus(o);
        if (cols[normalized]) cols[normalized].push({ ...o, _normalizedStatus: normalized });
    });

    document.getElementById('count-new').textContent = cols.NEW.length;
    document.getElementById('count-cooking').textContent = cols.COOKING.length;
    document.getElementById('count-baking').textContent = cols.BAKING.length;

    Object.keys(cols).forEach(status => {
        const container = document.getElementById(`col-${status}`);
        if (!container) return;

        container.innerHTML = cols[status]
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .map(order => {
                const timeAgo = Math.floor((new Date() - new Date(order.createdAt)) / 60000);
                const timeColor = timeAgo > 15 ? 'text-red-400' : (timeAgo > 10 ? 'text-amber-400' : 'text-gray-400');

                let actionBtn = '';
                if (status === 'NEW' || status === 'COOKING') {
                    actionBtn = `<button onclick="changeStatus(${order.id}, 'BAKING')" class="w-full mt-3 bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-lg transition-colors">В ПЕЧЬ</button>`;
                } else if (status === 'BAKING') {
                    actionBtn = `<button onclick="changeStatus(${order.id}, 'COMPLETED')" class="w-full mt-3 bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded-lg transition-colors">ГОТОВО</button>`;
                }

                const itemsHtml = order.items.map(item => `
                    <div class="py-1 border-b border-[#333] last:border-0 text-sm">
                        <div class="flex justify-between">
                            <span class="font-bold">${item.quantity}x ${item.product.name}</span>
                        </div>
                        ${item.modifiers && item.modifiers.length > 0 ? `
                            <div class="text-xs text-amber-500 mt-0.5">
                                Модификаторы: ${item.modifiers.map(m => m.modifier.name).join(', ')}
                            </div>
                        ` : ''}
                    </div>
                `).join('');

                return `
                    <div class="bg-[#1a1a1a] p-4 rounded-xl border-l-4 ${status === 'NEW' ? 'border-blue-500' : status === 'COOKING' ? 'border-amber-500' : 'border-orange-500'} kds-card shadow-lg">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-display font-black text-xl">Заказ #${order.id}</h3>
                            <span class="text-xs font-bold ${timeColor}">${timeAgo} мин</span>
                        </div>
                        <div class="text-xs text-gray-400 mb-2">Тип: ${order.source}</div>
                        <div class="bg-[#242424] rounded-lg p-2 mb-2">
                            ${itemsHtml}
                        </div>
                        ${actionBtn}
                    </div>
                `;
            }).join('');
    });
}

initKDS();
setInterval(renderBoard, 60000);

window.changeStatus = changeStatus;
