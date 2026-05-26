require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const { initFirebase, getProducts, createOrder, updateOrder, findOrderByCheckoutRequestId, db, now } = require('./firebase');
const { stkPush, parseCallback, normalizePhone } = require('./daraja');
const { handleIncomingMessage } = require('./botlogic');

const app = express();
const port = process.env.PORT || 3000;
let whatsappClient = null;
let latestQr = null;
let botStatus = { state: 'disabled', message: 'BOT_ENABLED is not true' };

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return res.status(500).json({ error: 'ADMIN_API_KEY is not configured.' });
  const provided = req.header('x-admin-key') || req.query.key;
  if (provided !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function startWhatsAppBot() {
  if (process.env.BOT_ENABLED !== 'true') return;

  whatsappClient = new Client({
    authStrategy: new LocalAuth({
      clientId: 'cymor-store',
      dataPath: process.env.WHATSAPP_SESSION_PATH || '.wwebjs_auth'
    }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  whatsappClient.on('qr', async (qr) => {
    latestQr = await QRCode.toDataURL(qr);
    botStatus = { state: 'pairing', message: 'Scan QR code from /pair.html' };
    console.log('WhatsApp QR generated. Open /pair.html to pair.');
  });

  whatsappClient.on('ready', () => {
    latestQr = null;
    botStatus = { state: 'ready', message: 'WhatsApp bot is online.' };
    console.log('WhatsApp bot ready.');
  });

  whatsappClient.on('authenticated', () => {
    botStatus = { state: 'authenticated', message: 'WhatsApp authenticated.' };
  });

  whatsappClient.on('disconnected', (reason) => {
    botStatus = { state: 'disconnected', message: reason };
  });

  whatsappClient.on('message', async (message) => {
    try {
      if (message.fromMe) return;
      await handleIncomingMessage(message, whatsappClient);
    } catch (error) {
      console.error('Bot message error:', error);
      await message.reply('Sorry, Cymor had trouble processing that. Please reply MENU or contact support.');
    }
  });

  whatsappClient.initialize();
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'cymor-enterprise',
    bot: botStatus,
    time: new Date().toISOString()
  });
});

app.get('/api/pair/status', requireAdmin, (req, res) => {
  res.json({ ...botStatus, hasQr: Boolean(latestQr) });
});

app.get('/api/pair/qr', requireAdmin, (req, res) => {
  if (!latestQr) return res.status(404).json({ error: 'QR code is not available. Bot may already be paired.' });
  res.json({ qr: latestQr, status: botStatus });
});

app.get('/api/products', async (req, res, next) => {
  try {
    res.json({ products: await getProducts({ activeOnly: req.query.all !== 'true' }) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/products', requireAdmin, async (req, res, next) => {
  try {
    const payload = {
      name: req.body.name,
      price: Number(req.body.price),
      sizes: Array.isArray(req.body.sizes) ? req.body.sizes : String(req.body.sizes || '').split(',').map((s) => s.trim()).filter(Boolean),
      imageUrl: req.body.imageUrl || null,
      stock: Number(req.body.stock || 0),
      active: req.body.active !== false,
      createdAt: now(),
      updatedAt: now()
    };
    const ref = await db().collection('products').add(payload);
    res.status(201).json({ id: ref.id, ...payload });
  } catch (error) {
    next(error);
  }
});

app.get('/api/orders', requireAdmin, async (req, res, next) => {
  try {
    const snap = await db().collection('orders').orderBy('createdAt', 'desc').limit(100).get();
    res.json({ orders: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders', async (req, res, next) => {
  try {
    const order = await createOrder({
      customerPhone: normalizePhone(req.body.customerPhone),
      items: req.body.items || [],
      delivery: req.body.delivery || {},
      paymentMethod: req.body.paymentMethod || 'mpesa'
    });
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

app.post('/api/orders/:orderId/pay', async (req, res, next) => {
  try {
    const orderRef = db().collection('orders').doc(req.params.orderId);
    const doc = await orderRef.get();
    if (!doc.exists) return res.status(404).json({ error: 'Order not found' });

    const order = { id: doc.id, ...doc.data() };
    const phone = normalizePhone(req.body.phone || order.customerPhone);
    const stk = await stkPush({ phone, amount: order.total, orderId: order.id });
    await updateOrder(order.id, {
      status: 'pending_payment',
      paymentStatus: 'pending',
      mpesa: {
        merchantRequestId: stk.MerchantRequestID,
        checkoutRequestId: stk.CheckoutRequestID,
        responseCode: stk.ResponseCode,
        responseDescription: stk.ResponseDescription,
        customerMessage: stk.CustomerMessage
      }
    });
    res.json({ orderId: order.id, mpesa: stk });
  } catch (error) {
    next(error);
  }
});

app.post('/api/mpesa/callback', async (req, res, next) => {
  try {
    const result = parseCallback(req.body);
    if (!result) return res.status(400).json({ error: 'Invalid M-Pesa callback' });

    await db().collection('mpesa_callbacks').add({
      ...result,
      createdAt: now()
    });

    const order = await findOrderByCheckoutRequestId(result.checkoutRequestId);
    if (order) {
      const paid = Number(result.resultCode) === 0;
      await updateOrder(order.id, {
        status: paid ? 'paid' : 'payment_failed',
        paymentStatus: paid ? 'paid' : 'failed',
        mpesaResult: result
      });
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? undefined : error.message
  });
});

initFirebase();
startWhatsAppBot();

app.listen(port, () => {
  console.log(`Cymor Enterprise running on port ${port}`);
});
