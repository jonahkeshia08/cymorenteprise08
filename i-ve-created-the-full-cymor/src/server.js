require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const QRCode = require('qrcode');
const P = require('pino');
const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default || baileys.makeWASocket || baileys;
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore
} = baileys;

// Note: Ensure saveSession and getSession are exported from your firebase.js
const { 
  initFirebase, 
  getProducts, 
  createOrder, 
  updateOrder, 
  findOrderByCheckoutRequestId, 
  db, 
  now,
  saveSession,
  getSession 
} = require('./firebase');

const { stkPush, parseCallback, normalizePhone } = require('./daraja');
const { handleIncomingMessage } = require('./botlogic');

const app = express();
const port = process.env.PORT || 3000;
let whatsappClient = null;
let latestQr = null;
let botStatus = { state: 'disabled', message: 'BOT_ENABLED is not true' };
let reconnecting = false;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/**
 * UTILITY FUNCTIONS
 */
function requireAdmin(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) return res.status(500).json({ error: 'ADMIN_API_KEY is not configured.' });
  const provided = req.header('x-admin-key') || req.query.key;
  if (provided !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function getMessageText(message) {
  const content = message.message || {};
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.buttonsResponseMessage?.selectedButtonId ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

function normalizeBaileysJid(jidOrPhone) {
  const value = String(jidOrPhone || '').trim();
  if (!value) return value;
  if (value.endsWith('@s.whatsapp.net') || value.endsWith('@g.us')) return value;
  return `${normalizePhone(value)}@s.whatsapp.net`;
}

function createBotMessage(rawMessage, sock) {
  const remoteJid = rawMessage.key.remoteJid;
  return {
    body: getMessageText(rawMessage),
    from: remoteJid,
    fromMe: Boolean(rawMessage.key.fromMe),
    raw: rawMessage,
    reply: (text) => sock.sendMessage(remoteJid, { text: String(text) })
  };
}

function createBotClient(sock) {
  return {
    sendMessage: (jidOrPhone, text) => {
      return sock.sendMessage(normalizeBaileysJid(jidOrPhone), { text: String(text) });
    }
  };
}

/**
 * CORE WHATSAPP BOT LOGIC (With Infinite Login Persistence)
 */
async function startWhatsAppBot() {
  if (process.env.BOT_ENABLED !== 'true') return;

  const sessionId = 'cymor_enterprise_session';
  const sessionPath = process.env.WHATSAPP_SESSION_PATH || '.baileys_auth';
  
  // 1. Initialize local state
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  
  // 2. ATTEMPT CLOUD RECOVERY: Download creds from Firebase if they exist
  const remoteSession = await getSession(sessionId);
  if (remoteSession && remoteSession.creds) {
    console.log('Restoring session from Firebase...');
    state.creds = remoteSession.creds;
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' })),
    },
    logger: P({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' }),
    browser: ['Cymor Enterprise', 'Chrome', '1.0.0'],
    printQRInTerminal: false
  });

  whatsappClient = createBotClient(sock);
  botStatus = { state: 'connecting', message: 'Connecting to WhatsApp...' };

  // 3. CLOUD SYNC: Save locally AND to Firebase whenever keys update
  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await saveSession(sessionId, { creds: state.creds });
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = await QRCode.toDataURL(qr);
      botStatus = { state: 'pairing', message: 'Scan QR code to link.' };
      console.log('New QR generated. Link now to stay logged in forever.');
    }

    if (connection === 'open') {
      latestQr = null;
      reconnecting = false;
      botStatus = { state: 'ready', message: 'WhatsApp bot is online! ✅' };
      console.log('Cymor Shoe Store Bot is LIVE.');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      botStatus = {
        state: shouldReconnect ? 'reconnecting' : 'logged_out',
        message: shouldReconnect ? 'Reconnecting...' : 'Logged out. Scan required.'
      };

      if (shouldReconnect && !reconnecting) {
        reconnecting = true;
        setTimeout(() => {
          reconnecting = false;
          startWhatsAppBot().catch(console.error);
        }, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const rawMessage of messages) {
      const message = createBotMessage(rawMessage, sock);
      if (message.fromMe || !message.body || message.from.endsWith('@g.us')) continue;

      try {
        await handleIncomingMessage(message, whatsappClient);
      } catch (error) {
        console.error('Bot processing error:', error);
        await message.reply('Sorry, Cymor had trouble processing that. Please reply MENU or contact support.');
      }
    }
  });
}

/**
 * API ROUTES
 */
app.get('/health', (req, res) => {
  res.json({ ok: true, bot: botStatus, time: new Date().toISOString() });
});

app.get('/api/pair/status', requireAdmin, (req, res) => {
  res.json({ ...botStatus, hasQr: Boolean(latestQr) });
});

app.get('/api/pair/qr', requireAdmin, (req, res) => {
  if (!latestQr) return res.status(404).json({ error: 'QR unavailable.' });
  res.json({ qr: latestQr, status: botStatus });
});

app.get('/api/products', async (req, res, next) => {
  try {
    res.json({ products: await getProducts({ activeOnly: req.query.all !== 'true' }) });
  } catch (error) { next(error); }
});

app.post('/api/products', requireAdmin, async (req, res, next) => {
  try {
    const payload = {
      name: req.body.name,
      price: Number(req.body.price),
      sizes: Array.isArray(req.body.sizes) ? req.body.sizes : String(req.body.sizes || '').split(',').map(s => s.trim()).filter(Boolean),
      imageUrl: req.body.imageUrl || null,
      stock: Number(req.body.stock || 0),
      active: req.body.active !== false,
      createdAt: now(),
      updatedAt: now()
    };
    const ref = await db().collection('products').add(payload);
    res.status(201).json({ id: ref.id, ...payload });
  } catch (error) { next(error); }
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
      mpesa: { checkoutRequestId: stk.CheckoutRequestID }
    });
    res.json({ orderId: order.id, mpesa: stk });
  } catch (error) { next(error); }
});

app.post('/api/mpesa/callback', async (req, res, next) => {
  try {
    const result = parseCallback(req.body);
    if (!result) return res.status(400).json({ error: 'Invalid callback' });
    await db().collection('mpesa_callbacks').add({ ...result, createdAt: now() });

    const order = await findOrderByCheckoutRequestId(result.checkoutRequestId);
    if (order) {
      const paid = Number(result.resultCode) === 0;
      await updateOrder(order.id, {
        status: paid ? 'paid' : 'payment_failed',
        paymentStatus: paid ? 'paid' : 'failed'
      });
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) { next(error); }
});

// Error Handling
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

// STARTUP
initFirebase();
startWhatsAppBot().catch(console.error);

app.listen(port, () => {
  console.log(`Cymor Enterprise running on port ${port}`);
});
