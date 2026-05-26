const admin = require('firebase-admin');

let app;

function getPrivateKey() {
  const key = process.env.FIREBASE_PRIVATE_KEY;
  return key ? key.replace(/\\n/g, '\n') : undefined;
}

function initFirebase() {
  if (app) return app;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin credentials. Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
  }

  app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  return app;
}

function db() {
  initFirebase();
  return admin.firestore();
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

async function getProducts({ activeOnly = true } = {}) {
  let query = db().collection('products').orderBy('name', 'asc');
  if (activeOnly) query = query.where('active', '==', true);
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function getProduct(productId) {
  const doc = await db().collection('products').doc(productId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function createCustomer(phone, profile = {}) {
  const ref = db().collection('customers').doc(phone);
  await ref.set({
    phone,
    name: profile.name || null,
    source: profile.source || 'whatsapp',
    updatedAt: now(),
    createdAt: now()
  }, { merge: true });
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

async function createOrder({ customerPhone, items, delivery, paymentMethod = 'mpesa' }) {
  const total = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  const ref = await db().collection('orders').add({
    customerPhone,
    items,
    delivery: delivery || {},
    total,
    status: 'pending_payment',
    paymentMethod,
    paymentStatus: 'pending',
    createdAt: now(),
    updatedAt: now()
  });
  return { id: ref.id, customerPhone, items, delivery, total, status: 'pending_payment', paymentStatus: 'pending' };
}

async function updateOrder(orderId, patch) {
  const ref = db().collection('orders').doc(orderId);
  await ref.set({ ...patch, updatedAt: now() }, { merge: true });
  const doc = await ref.get();
  return { id: doc.id, ...doc.data() };
}

async function findOrderByCheckoutRequestId(checkoutRequestId) {
  const snap = await db().collection('orders')
    .where('mpesa.checkoutRequestId', '==', checkoutRequestId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function saveBotSession(phone, state) {
  await db().collection('bot_sessions').doc(phone).set({
    phone,
    ...state,
    updatedAt: now()
  }, { merge: true });
}

async function getBotSession(phone) {
  const doc = await db().collection('bot_sessions').doc(phone).get();
  return doc.exists ? doc.data() : { step: 'home', cart: [] };
}

module.exports = {
  admin,
  db,
  now,
  initFirebase,
  getProducts,
  getProduct,
  createCustomer,
  createOrder,
  updateOrder,
  findOrderByCheckoutRequestId,
  saveBotSession,
  getBotSession
};
