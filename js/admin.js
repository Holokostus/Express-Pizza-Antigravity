const formatCurrency = (value) => {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'BYN',
        maximumFractionDigits: 2
    }).format(value || 0);
};

const renderChart = (chartData) => {
    const canvas = document.getElementById('revenueChart');
    if (!canvas) return;

    const labels = chartData.map(point => {
        const date = new Date(point.date);
        return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
    });

    const revenues = chartData.map(point => point.revenue);

    new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Выручка, BYN',
                data: revenues,
                borderColor: '#34d399',
                backgroundColor: 'rgba(52, 211, 153, 0.15)',
                fill: true,
                tension: 0.35,
                borderWidth: 3,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#cbd5e1'
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.08)' }
                },
                y: {
                    ticks: { color: '#94a3b8' },
                    grid: { color: 'rgba(148, 163, 184, 0.08)' }
                }
            }
        }
    });
};

const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

const loadAnalytics = async () => {
    try {
        const response = await fetch('/api/admin/analytics');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        setText('kpi-revenue', formatCurrency(data.revenueToday));
        setText('kpi-aov', formatCurrency(data.aov));
        setText('kpi-loyalty', `${(data.loyaltyDebt || 0).toLocaleString('ru-RU')} баллов`);
        setText('orders-today', `Выполненных заказов сегодня: ${data.completedOrdersToday || 0}`);

        renderChart(data.chart || []);
    } catch (error) {
        console.error('Ошибка загрузки аналитики:', error);
        setText('orders-today', 'Не удалось загрузить аналитику');
    }
};

document.addEventListener('DOMContentLoaded', loadAnalytics);
