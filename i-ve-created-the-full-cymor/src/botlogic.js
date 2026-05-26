const {
  getProducts,
  createCustomer,
  createOrder,
  saveBotSession,
  getBotSession,
  updateOrder
} = require('./firebase');
const { stkPush } = require('./daraja');
const menu = require('./menurender');

function whatsappToPhone(id) {
  return String(id || '').split('@')[0];
}

function parseDelivery(text) {
  const [name, town, ...rest] = text.split(',').map((part) => part.trim()).filter(Boolean);
  return {
    name: name || null,
    town: town || null,
    location: rest.join(', ') || null,
    raw: text
  };
}

async function handleIncomingMessage(message, client) {
  const text = String(message.body || '').trim();
  const phone = whatsappToPhone(message.from);
  const storeName = process.env.STORE_NAME || 'Cymor Shoe Store';
  const storePhone = process.env.STORE_PHONE || '';

  if (!text) return;
  await createCustomer(phone, { source: 'whatsapp' });

  const session = await getBotSession(phone);
  const lower = text.toLowerCase();

  if (['hi', 'hello', 'menu', 'start', '0'].includes(lower)) {
    await saveBotSession(phone, { step: 'home', cart: session.cart || [] });
    await message.reply(menu.homeMenu(storeName));
    return;
  }

  if (session.step === 'products') {
    const products = await getProducts();
    const selectedIndex = Number(text) - 1;
    const selected = products[selectedIndex];

    if (!selected) {
      await message.reply('Please choose a valid shoe number, or reply 0 to go back.');
      return;
    }

    const cart = [...(session.cart || [])];
    const existing = cart.find((item) => item.productId === selected.id);
    if (existing) existing.quantity += 1;
    else cart.push({ productId: selected.id, name: selected.name, price: Number(selected.price), quantity: 1 });

    await saveBotSession(phone, { step: 'cart', cart });
    await message.reply(`${selected.name} added to cart.\n\n${menu.cartSummary(cart)}`);
    return;
  }

  if (session.step === 'cart') {
    if (text === '1') {
      if (!session.cart || !session.cart.length) {
        await message.reply('Your cart is empty. Reply 1 to view shoes.');
        return;
      }
      await saveBotSession(phone, { step: 'delivery', cart: session.cart });
      await message.reply(menu.askDelivery());
      return;
    }

    if (text === '2') {
      await saveBotSession(phone, { step: 'home', cart: [] });
      await message.reply('Cart cleared.\n\n' + menu.homeMenu(storeName));
      return;
    }
  }

  if (session.step === 'delivery') {
    const delivery = parseDelivery(text);
    const order = await createOrder({
      customerPhone: phone,
      items: session.cart || [],
      delivery,
      paymentMethod: 'mpesa'
    });

    try {
      const stk = await stkPush({ phone, amount: order.total, orderId: order.id });
      await updateOrder(order.id, {
        mpesa: {
          merchantRequestId: stk.MerchantRequestID,
          checkoutRequestId: stk.CheckoutRequestID,
          responseCode: stk.ResponseCode,
          responseDescription: stk.ResponseDescription,
          customerMessage: stk.CustomerMessage
        }
      });
      await saveBotSession(phone, { step: 'home', cart: [], lastOrderId: order.id });
      await message.reply(menu.orderCreated(order));
    } catch (error) {
      await updateOrder(order.id, {
        status: 'payment_prompt_failed',
        paymentStatus: 'failed',
        paymentError: error.message
      });
      await message.reply(`Order ${order.id} was created, but the M-Pesa prompt failed. Cymor support will follow up.`);
      if (client && storePhone) {
        await client.sendMessage(`${storePhone}@c.us`, `Payment prompt failed for order ${order.id}: ${error.message}`);
      }
    }
    return;
  }

  if (text === '1') {
    const products = await getProducts();
    await saveBotSession(phone, { step: 'products', cart: session.cart || [] });
    await message.reply(menu.productList(products));
    return;
  }

  if (text === '2') {
    await saveBotSession(phone, { step: 'cart', cart: session.cart || [] });
    await message.reply(menu.cartSummary(session.cart || []));
    return;
  }

  if (text === '3') {
    await message.reply('We deliver within Kenya. Delivery fee depends on town, estate, and rider/courier option.');
    return;
  }

  if (text === '4') {
    await message.reply(menu.support(storePhone));
    return;
  }

  await message.reply(menu.homeMenu(storeName));
}

module.exports = {
  handleIncomingMessage,
  whatsappToPhone,
  parseDelivery
};
