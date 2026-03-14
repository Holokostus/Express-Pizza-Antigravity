const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('ep_auth_token');
    const headers = { ...(options.headers || {}) };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
        window.location.href = '/';
        throw new Error('Недостаточно прав доступа');
    }

    return response;
};

const productsBody = document.getElementById('products-body');
const addProductBtn = document.getElementById('add-product-btn');
const modal = document.getElementById('product-modal');
const modalTitle = document.getElementById('modal-title');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelBtn = document.getElementById('cancel-btn');
const productForm = document.getElementById('product-form');

const productIdInput = document.getElementById('product-id');
const nameInput = document.getElementById('name');
const descriptionInput = document.getElementById('description');
const priceInput = document.getElementById('price');
const categoryInput = document.getElementById('category');
const imageInput = document.getElementById('image');

let products = [];
let categories = [];

function resolveImageSrc(image) {
    if (!image) return '';
    const trimmed = String(image).trim();
    if (!trimmed) return '';

    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    return `/${trimmed.replace(/^\/+/, '')}`;
}

async function openModal(mode, product = null) {
    await fetchCategories();
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (mode === 'edit' && product) {
        modalTitle.textContent = 'Редактировать товар';
        productIdInput.value = product.id;
        nameInput.value = product.name || '';
        descriptionInput.value = product.description || '';
        priceInput.value = product.sizes?.[0]?.price || '';
        categoryInput.value = product.category?.slug || '';
        imageInput.value = product.image || '';
    } else {
        modalTitle.textContent = 'Добавить товар';
        productForm.reset();
        productIdInput.value = '';
        if (categories.length > 0) {
            categoryInput.value = categories[0].slug;
        }
    }
}

function closeModal() {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function renderProducts() {
    if (!products.length) {
        productsBody.innerHTML = '<div class="rounded-xl border border-slate-800 px-4 py-6 text-slate-400">Товары не найдены.</div>';
        return;
    }

    const productsByCategory = categories.map((category) => ({
        category,
        items: products.filter((product) => product.category?.slug === category.slug),
    })).filter((group) => group.items.length > 0);

    productsBody.innerHTML = productsByCategory.map(({ category, items }, index) => `
        <details class="rounded-2xl border border-slate-800 bg-slate-950/40" ${index === 0 ? 'open' : ''}>
            <summary class="list-none cursor-pointer px-4 py-3 md:px-5 md:py-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
                <div>
                    <h3 class="font-semibold text-lg">${category.name}</h3>
                    <p class="text-xs text-slate-400 mt-1">${items.length} шт.</p>
                </div>
                <span class="text-slate-400 text-sm">Развернуть</span>
            </summary>
            <div class="px-4 md:px-5 pb-4 space-y-3">
                ${items.map((product) => {
                    const price = product.sizes?.[0]?.price ?? '—';
                    const imageSrc = resolveImageSrc(product.image);
                    return `
                        <div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div class="min-w-0 flex items-start gap-3">
                                <img src="${imageSrc || '/images/pepperoni.jpg'}" alt="${product.name || 'Изображение товара'}"
                                    class="w-14 h-14 rounded-lg object-cover bg-slate-800 border border-slate-700 shrink-0"
                                    loading="lazy"
                                    onerror="this.onerror=null;this.src='/images/pepperoni.jpg'">
                                <div>
                                    <div class="font-semibold">${product.name}</div>
                                    <div class="text-slate-400 text-sm">${product.description || ''}</div>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 md:gap-4">
                                <div class="text-sm text-slate-300 min-w-[88px]">${price} BYN</div>
                                <div class="flex gap-2">
                                    <button class="edit-btn rounded-md border border-blue-400/40 px-3 py-1 text-blue-300 hover:bg-blue-500/10" data-id="${product.id}">
                                        Редактировать
                                    </button>
                                    <button class="delete-btn rounded-md border border-red-400/40 px-3 py-1 text-red-300 hover:bg-red-500/10" data-id="${product.id}">
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </details>
    `).join('');
}

async function fetchCategories() {
    const response = await authFetch('/api/categories');
    if (!response.ok) {
        throw new Error('Ошибка загрузки категорий');
    }

    categories = await response.json();
    categoryInput.innerHTML = categories
        .map((category) => `<option value="${category.slug}">${category.name}</option>`)
        .join('');
}

async function fetchProducts() {
    const response = await authFetch('/api/menu');
    if (!response.ok) {
        throw new Error('Ошибка загрузки товаров');
    }

    const categoryPayload = await response.json();
    products = categoryPayload.flatMap((category) =>
        (category.products || []).map((product) => ({
            ...product,
            category: { slug: category.slug, name: category.name },
        }))
    );

    renderProducts();
}

async function saveProduct(event) {
    event.preventDefault();

    const id = productIdInput.value;
    const payload = {
        name: nameInput.value.trim(),
        description: descriptionInput.value.trim(),
        price: Number(priceInput.value),
        categorySlug: categoryInput.value,
        image: imageInput.value.trim(),
    };

    const url = id ? `/api/menu/${id}` : '/api/menu';
    const method = id ? 'PUT' : 'POST';

    const response = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Ошибка сохранения товара');
    }

    closeModal();
    await fetchProducts();
}

async function deleteProduct(id) {
    const ok = window.confirm('Удалить этот товар?');
    if (!ok) return;

    const response = await authFetch(`/api/menu/${id}`, { method: 'DELETE' });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Ошибка удаления товара');
    }

    await fetchProducts();
}

addProductBtn.addEventListener('click', async () => {
    try {
        await openModal('create');
    } catch (error) {
        alert(error.message);
    }
});
closeModalBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
productForm.addEventListener('submit', async (event) => {
    try {
        await saveProduct(event);
    } catch (error) {
        alert(error.message);
    }
});

productsBody.addEventListener('click', async (event) => {
    const editButton = event.target.closest('.edit-btn');
    if (editButton) {
        const id = Number(editButton.dataset.id);
        const product = products.find((item) => item.id === id);
        if (product) {
            try {
                await openModal('edit', product);
            } catch (error) {
                alert(error.message);
            }
        }
        return;
    }

    const deleteButton = event.target.closest('.delete-btn');
    if (deleteButton) {
        const id = Number(deleteButton.dataset.id);
        try {
            await deleteProduct(id);
        } catch (error) {
            alert(error.message);
        }
    }
});

(async function init() {
    try {
        await fetchCategories();
        await fetchProducts();
    } catch (error) {
        productsBody.innerHTML = `<div class="rounded-xl border border-red-900 bg-red-900/20 px-4 py-6 text-red-300">${error.message}</div>`;
    }
})();
