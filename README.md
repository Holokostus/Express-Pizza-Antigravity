# Express Pizza — FoodTech SaaS MVP

This repository contains the completed Sprint 7 MVP for the Express Pizza system. It includes a fully integrated Node.js API, Prisma ORM over PostgreSQL, WebSockets for KDS, and robust vanilla JS frontends.

## 🚀 Quick Start Guide

### 1. Prerequisites
*   Node.js (v18+)
*   PostgreSQL (or a Docker instance)

### 2. Environment Setup
1.  Navigate to the `server` directory.
2.  Copy `.env.example` to a new `.env` file (`cp .env.example .env`).
3.  Update the `DATABASE_URL` with your active PostgreSQL connection string.
4.  Optionally fill out the rest of the secrets (JWT, SMS, Telegram, bePaid) for production environments.

### 3. Database Initialization
From within the `server` directory, install dependencies and run the Prisma migrations:
```bash
cd server
npm install
npx prisma generate
npx prisma db push
```

*(Optional)* If you have seed logic prepared for your MVP:
```bash
npx prisma db seed
```

### 4. Running the Backend
To start the Express server (usually on port 3000):
```bash
npm run dev
```

### 5. Running the Frontend
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
2.  Enter your phone number (e.g., `+375291112233`).
3.  Enter the default development SMS PIN code: `1111`.
4.  *Important:* The first time you log in, you are automatically registered as a `CUSTOMER`. **Dashboard access will fail.**
5.  Open Prisma Studio using your terminal:
    ```bash
    npx prisma studio
    ```
6.  Navigate to the `User` table, find your newly created row, and change your `role` column to `ADMIN`. Commit the change.
7.  Reload the `admin.html` page and re-enter your SMS auth. You will now have secured access to view Orders and manage the Menu Stop-lists.

---

## 📡 Integrations Configuration

*   **CORS:** By default, Express is configured with `cors()` with wide-open origins for MVP phase. Secure this in `app.use(cors({ origins: [...] }))` prior to serious production load.
*   **Payments (bePaid):** Ensure `BEPAID_SHOP_ID` and `BEPAID_SECRET_KEY` are placed in `.env` to enable secure card acquiring sessions.
*   **KDS (Kitchen Display System):** The dashboard relies on `ws` / `socket.io` for real-time kitchen tracking.
*   **Thermal Printers:** The backend printerService natively talks TCP on port 9100. Provide a `PRINTER_IP` in your `.env`. If no printer exists locally, it safely debounces queues to prevent event-loop freezing.
