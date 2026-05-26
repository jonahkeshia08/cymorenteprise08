function money(amount) {
  return `*KES ${Number(amount || 0).toLocaleString('en-KE')}*`;
}

function homeMenu(storeName = 'Cymor Shoe Store') {
  return [
    `*👟 WELCOME TO ${storeName.toUpperCase()}*`,
    '━═━═━═━═━═━═━═━═━',
    '',
    'Experience quality footwear delivered to your doorstep. How can we help you today?',
    '',
    '*1.* 🛍️ View Catalog',
    '*2.* 🛒 My Shopping Cart',
    '*3.* 🚚 Delivery Info',
    '*4.* 💬 Talk to Support',
    '',
    '━═━═━═━═━═━═━═━═━',
    '*Powered by CymorTechServices*'
  ].join('\n');
}

function productList(products) {
  if (!products.length) return '❌ No shoes are available right now. Please check again soon.';

  const lines = products.map((product, index) => {
    const sizes = Array.isArray(product.sizes) && product.sizes.length 
      ? `\n   📏 *Sizes:* ${product.sizes.join(', ')}` 
      : '';
    return `*${index + 1}.* 👟 *${product.name}*\n   💰 *Price:* ${money(product.price)}${sizes}\n`;
  });

  return [
    '*🔥 AVAILABLE COLLECTIONS*',
    '━═━═━═━═━═━═━═━═━',
    '',
    ...lines,
    '━━━━━━━━━━━━━━━━━━',
    '💡 *Reply with the product number to add to cart.*',
    '💡 *Reply 0 to go back.*',
    '',
    '*Powered by CymorTechServices*'
  ].join('\n');
}

function cartSummary(cart) {
  if (!cart || !cart.length) {
    return 'Your cart is empty. 🛒\nReply *1* to view our amazing collection!';
  }

  const lines = cart.map((item, index) => {
    return `*${index + 1}.* ${item.name} (x${item.quantity}) — ${money(item.price * item.quantity)}`;
  });
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return [
    '*🛒 YOUR SHOPPING CART*',
    '━═━═━═━═━═━═━═━═━',
    '',
    ...lines,
    '',
    '━━━━━━━━━━━━━━━━━━',
    `*TOTAL PAYABLE: ${money(total)}*`,
    '━━━━━━━━━━━━━━━━━━',
    '',
    '📌 *Reply:*',
    '*1.* 💳 Checkout via M-Pesa',
    '*2.* 🗑️ Clear Cart',
    '*0.* 🔙 Back to Menu',
    '',
    '*Powered by CymorTechServices*'
  ].join('\n');
}

function askDelivery() {
  return [
    '*🚚 DELIVERY DETAILS*',
    '━═━═━═━═━═━═━═━═━',
    '',
    'Please send your details in this format:',
    '',
    '_Name, Town/Estate, Exact Location_',
    '',
    '*Example:*',
    '_John Doe, Kisumu CBD, Oginga Street near Equity_',
    '',
    '━═━═━═━═━═━═━═━═━',
    '*Powered by CymorTechServices*'
  ].join('\n');
}

function orderCreated(order) {
  return [
    '✅ *ORDER RECEIVED!*',
    '━═━═━═━═━═━═━═━═━',
    '',
    `*Order ID:* #${order.id.slice(-6).toUpperCase()}`,
    `*Amount:* ${money(order.total)}`,
    '',
    '📱 *M-PESA:* A payment prompt has been sent to your phone. Please enter your PIN to confirm.',
    '',
    '━═━═━═━═━═━═━═━═━',
    '*Powered by CymorTechServices*'
  ].join('\n');
}

function support(storePhone) {
  return [
    '*👨‍💻 CYMOR SUPPORT*',
    '━═━═━═━═━═━═━═━═━',
    '',
    'An agent has been notified and will be with you shortly.',
    '',
    `📞 *Direct Line:* ${storePhone}`,
    '📧 *Email:* support@cymortech.com',
    '',
    '━═━═━═━═━═━═━═━═━',
    '*Powered by CymorTechServices*'
  ].join('\n');
}

module.exports = {
  money,
  homeMenu,
  productList,
  cartSummary,
  askDelivery,
  orderCreated,
  support
};
