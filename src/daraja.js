const axios = require('axios');

function darajaBaseUrl() {
  return process.env.DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

async function getAccessToken() {
  const key = process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.DARAJA_CONSUMER_SECRET;
  if (!key || !secret) throw new Error('Missing Daraja consumer credentials.');

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const { data } = await axios.get(`${darajaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  return data.access_token;
}

async function stkPush({ phone, amount, orderId }) {
  const token = await getAccessToken();
  const shortcode = process.env.DARAJA_SHORTCODE;
  const passkey = process.env.DARAJA_PASSKEY;
  const callbackUrl = process.env.DARAJA_CALLBACK_URL;
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');

  if (!shortcode || !passkey || !callbackUrl) {
    throw new Error('Missing Daraja STK settings.');
  }

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.ceil(Number(amount)),
    PartyA: normalizePhone(phone),
    PartyB: shortcode,
    PhoneNumber: normalizePhone(phone),
    CallBackURL: callbackUrl,
    AccountReference: `${process.env.DARAJA_ACCOUNT_REFERENCE || 'CYMOR'}-${orderId}`,
    TransactionDesc: process.env.DARAJA_TRANSACTION_DESC || 'Cymor Shoe Store Order'
  };

  const { data } = await axios.post(`${darajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, payload, {
    headers: { Authorization: `Bearer ${token}` }
  });

  return data;
}

function parseCallback(body) {
  const callback = body?.Body?.stkCallback;
  if (!callback) return null;

  const metadata = callback.CallbackMetadata?.Item || [];
  const values = Object.fromEntries(metadata.map((item) => [item.Name, item.Value]));

  return {
    merchantRequestId: callback.MerchantRequestID,
    checkoutRequestId: callback.CheckoutRequestID,
    resultCode: callback.ResultCode,
    resultDesc: callback.ResultDesc,
    amount: values.Amount || null,
    receipt: values.MpesaReceiptNumber || null,
    transactionDate: values.TransactionDate || null,
    phone: values.PhoneNumber || null,
    raw: body
  };
}

module.exports = {
  normalizePhone,
  stkPush,
  parseCallback
};
