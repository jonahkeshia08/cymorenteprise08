function money(amount) {
  return `KES ${Number(amount || 0).toLocaleString('en-KE')}`;
}

function homeMenu(storeName = 'Cymor Shoe Store') {
  return [
    `Welcome to ${storeName}.`,
    '',
    'Reply with:',
    '1. View shoes',
    '2. My cart',
    '3. Delivery info',
    '4. Talk to support'
  ].join('\n');
}

function productList(products) {
  if (!products.length) return 'No shoes are available right now. Please check again soon.';

  const lines = products.map((product, index) => {
    const sizes = Array.isArray(product.sizes) && product.sizes.length ? ` | Sizes: ${product.sizes.join(', ')}` : '';
    return `${index + 1}. ${product.name} - ${money(product.price)}${sizes}`;
  });

  return [
    'Available shoes:',
    ...lines,
    '',
    'Reply with the product number to add it to cart.',
    'Reply 0 to go back.'
  ].join('\n');
}

function cartSummary(cart) {
  if (!cart || !cart.length) {
    return 'Your cart is empty. Reply 1 to view shoes.';
  }

  const lines = cart.map((item, index) => {
    return `${index + 1}. ${item.name} x${item.quantity} - ${money(item.price * item.quantity)}`;
  });
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return [
    'Your cart:',
    ...lines,
    '',
    `Total: ${money(total)}`,
    '',
    'Reply:',
    '1. Checkout with M-Pesa',
    '2. Clear cart',
    '0. Back'
  ].join('\n');
}

function askDelivery() {
  return [
    'Send your delivery details in this format:',
    '',
    'Name, Town/Estate, Exact location',
    '',
    'Example:',
    'Amina, Nairobi CBD, Kimathi Street near Jamia Mall'
  ].join('\n');
}

function orderCreated(order) {
  return [
    `Order ${order.id} created.`,
    `Amount: ${money(order.total)}`,
    '',
    'An M-Pesa prompt will be sent to your phone. Enter your PIN to complete payment.'
  ].join('\n');
}

function support(storePhone) {
  return `A Cymor support agent will help you shortly. You can also call or WhatsApp ${storePhone}.`;
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
