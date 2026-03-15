# Express Pizza — FoodTech SaaS MVP

This repository contains the completed Sprint 7 MVP for the Express Pizza system. It includes a fully integrated Node.js API, Prisma ORM over PostgreSQL, WebSockets for KDS, and robust vanilla JS frontends.

## 🚀 Quick Start Guide

### 1. Prerequisites
*   Node.js (v18+)
*   PostgreSQL (or a Docker instance)

### Быстрый старт

1.  Установите зависимости в папке сервера:
    ```bash
    cd server
    npm install
    ```
2.  Настройка `.env`: скопируйте `.env.example` в `.env` и задайте необходимые переменные (`JWT_SECRET`, `BEPAID_SECRET_KEY` и т.д.).
3.  Инициализируйте базу данных:
    ```bash
    npx prisma db push
    ```
4.  Запустите сервер для разработки:
    ```bash
    npm run dev
    ```

*Примечание:* В проекте реализована мощная Telegram-интеграция для уведомлений менеджеров, строгая Zod валидация входящих данных и надежная защита от спама (rate-limiting).

### Запуск Frontend
The frontend consists of static HTML, CSS, and JS files located in the root repository folder. You can serve them using any local static web server (like VS Code Live Server, or `npx serve`).
```bash
# In the root app directory
npx serve .
```

*   **Client App:** Navigate to `http://localhost:5000` (or whichever port `serve` chose).
*   **Admin Dashboard:** Navigate to `http://localhost:5000/admin.html`.

---

## 🔐 Admin Dashboard Access Setup (Local Development)

The Admin dashboard (`admin.html`) is secured by JWT and requires the `ADMIN` database role. For local development, follow these steps to bootstrap an admin user:

1.  Open the Admin Panel in your browser. It will immediately prompt you for your phone number.
2.  Enter your email address (e.g., `admin@example.com`).
3.  Request OTP code and enter it from email. In development mode, backend additionally returns `debugCode` in `/api/auth/send-email` response when SMTP is unavailable.
4.  *Important:* The first time you log in, you are automatically registered as a `CUSTOMER`. **Dashboard access will fail.**
5.  Open Prisma Studio using your terminal:
    ```bash
    npx prisma studio
    ```
6.  Navigate to the `User` table, find your newly created row, and change your `role` column to `ADMIN`. Commit the change.
7.  Reload the `admin.html` page and re-enter your email OTP auth. You will now have secured access to view Orders and manage the Menu Stop-lists.

---

## 📡 Integrations Configuration

*   **Demo-only integrations:** deprecated mock integrations were removed from the repository to avoid accidental use in production flows.
*   **CORS:** By default, Express is configured with `cors()` with wide-open origins for MVP phase. Secure this in `app.use(cors({ origins: [...] }))` prior to serious production load.
*   **Payments (bePaid):** Ensure `BEPAID_SHOP_ID` and `BEPAID_SECRET_KEY` are placed in `.env` to enable secure card acquiring sessions.
*   **KDS (Kitchen Display System):** The dashboard relies on `ws` / `socket.io` for real-time kitchen tracking.
*   **Thermal Printers:** The backend printerService natively talks TCP on port 9100. Provide a `PRINTER_IP` in your `.env`. If no printer exists locally, it safely debounces queues to prevent event-loop freezing.


## 🔐 API Authorization Matrix

Для чувствительных endpoint-ов теперь обязательно передавать `Authorization: Bearer <JWT>`; ответы `401/403` возвращаются централизованно через middleware `requireAuth` + `checkRole(...)`.

### Protected endpoints

* `GET /api/fetch-images` — `ADMIN`
* `POST /api/stock/out` — `COOK`, `ADMIN`
* `POST /api/stock/back` — `COOK`, `ADMIN`
* `GET /api/stock/stop-list/:restaurantId` — `COOK`, `ADMIN`
* `POST /api/pos/retry` — `ADMIN`
* `POST /api/print/service` — `COOK`, `ADMIN`
* `POST /api/print/kitchen` — `COOK`, `ADMIN`
* `POST /api/print/reprint/:receiptId` — `COOK`, `ADMIN`

### Public read-only endpoints

Публичными оставлены только безопасные read-only endpoint-ы (по бизнес-решению), включая:

* `GET /api/menu`
* `GET /api/health`

Остальные endpoint-ы с операциями управления, синхронизации, печати и back-office должны вызываться только авторизованными пользователями с подходящей ролью.
