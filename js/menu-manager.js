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

function openModal(mode, product = null) {
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
        productsBody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-slate-400">Товары не найдены.</td></tr>';
        return;
    }

    productsBody.innerHTML = products.map((product) => {
        const price = product.sizes?.[0]?.price ?? '—';
        return `
            <tr>
                <td class="px-4 py-3">
                    <div class="font-semibold">${product.name}</div>
                    <div class="text-slate-400 text-sm">${product.description || ''}</div>
                </td>
                <td class="px-4 py-3 text-slate-300">${product.category?.name || '—'}</td>
                <td class="px-4 py-3">${price} BYN</td>
                <td class="px-4 py-3">
                    <div class="flex gap-2">
                        <button class="edit-btn rounded-md border border-blue-400/40 px-3 py-1 text-blue-300 hover:bg-blue-500/10" data-id="${product.id}">
                            Редактировать
                        </button>
                        <button class="delete-btn rounded-md border border-red-400/40 px-3 py-1 text-red-300 hover:bg-red-500/10" data-id="${product.id}">
                            Удалить
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function fetchCategories() {
    const response = await fetch('/api/categories');
    if (!response.ok) {
        throw new Error('Ошибка загрузки категорий');
    }

    categories = await response.json();
    categoryInput.innerHTML = categories
        .map((category) => `<option value="${category.slug}">${category.name}</option>`)
        .join('');
}

async function fetchProducts() {
    const response = await fetch('/api/menu');
    if (!response.ok) {
        throw new Error('Ошибка загрузки товаров');
    }

    products = await response.json();
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

    const response = await fetch(url, {
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

    const response = await fetch(`/api/menu/${id}`, { method: 'DELETE' });
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Ошибка удаления товара');
    }

    await fetchProducts();
}

addProductBtn.addEventListener('click', () => openModal('create'));
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
            openModal('edit', product);
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
        productsBody.innerHTML = `<tr><td colspan="4" class="px-4 py-6 text-red-300">${error.message}</td></tr>`;
    }
})();
