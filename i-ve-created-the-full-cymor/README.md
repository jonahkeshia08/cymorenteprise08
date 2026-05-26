# Cymor Enterprise

Production-style MVP for **Cymor Shoe Store** under **Cymor Tech Services**. It includes a WhatsApp ordering bot, Firebase storage, M-Pesa Daraja STK Push, pairing UI, admin product/order dashboard, and Render deployment config.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy env values:

```bash
cp .env.example .env
```

3. Fill in Firebase Admin SDK, Daraja, and admin secret values in `.env`.

4. Run locally:

```bash
npm run dev
```

5. Open:

- `http://localhost:3000/pair.html` for WhatsApp QR pairing.
- `http://localhost:3000/admin.html` for products and orders.
- `http://localhost:3000/health` for service health.

## Firebase Collections

- `products`: shoe catalog.
- `customers`: WhatsApp/customer records.
- `orders`: cart, delivery, payment, fulfillment state.
- `bot_sessions`: current conversation step and cart.
- `mpesa_callbacks`: raw payment callback audit trail.

## Core Flow

1. Customer sends WhatsApp message.
2. Bot shows catalog from Firebase.
3. Customer adds shoes to cart.
4. Bot asks for delivery details.
5. Order is created in Firebase.
6. Daraja STK Push is sent.
7. Safaricom callback updates order status.
8. Admin tracks orders from dashboard.

## Deploy on Render

1. Push this repository to GitHub.
2. Create a Render Web Service.
3. Use `npm install` as build command and `npm start` as start command.
4. Add all `.env.example` variables in Render Environment.
5. Set `DARAJA_CALLBACK_URL` to:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/mpesa/callback
```

6. Pair WhatsApp at:

```text
https://YOUR-RENDER-SERVICE.onrender.com/pair.html
```

## Security Notes

- Keep `ADMIN_API_KEY` long and private.
- Do not commit Firebase private keys.
- Restrict Firebase service account permissions for production.
- Move WhatsApp session storage to persistent infrastructure before serious scale.
- Add rate limiting and a proper admin login before public launch.

## Scaling Roadmap

- Add Redis for bot/session caching.
- Add role-based admin authentication.
- Add inventory reservations during checkout.
- Add delivery provider integrations.
- Split bot worker from API server.
- Add observability: structured logs, alerts, payment reconciliation, and order SLA dashboards.
