import crypto from "crypto";
import Razorpay from "razorpay";
import QRCode from "qrcode";
import Payment from "../models/Payment.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import { env } from "../config/env.js";

/**
 * Build a UPI payment intent string for paying a host directly (peer-to-peer).
 * Scanning/opening it launches the payer's UPI app pre-filled with the host's
 * VPA and the amount — the convenient "pay the person via QR" campus flow.
 */
export function buildUpiIntent({ vpa, payeeName, amount, note }) {
  // The VPA (pa) is kept literal — UPI apps expect the `@` unencoded — while
  // free-text fields (payee name, note) are URI-encoded.
  const parts = [
    `pa=${vpa}`,
    `pn=${encodeURIComponent(payeeName || "Trip host")}`,
    `am=${amount}`,
    "cu=INR"
  ];
  if (note) parts.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${parts.join("&")}`;
}

// Render a UPI intent as a QR data-URL the client can drop straight into <img>.
export async function buildUpiQr(intent) {
  return QRCode.toDataURL(intent, { margin: 1, width: 240 });
}

function razorpayClient() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    const error = new Error("Razorpay keys are not configured");
    error.statusCode = 503;
    throw error;
  }
  return new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
}

export async function createRazorpayOrder({ userId, rideId, amount, purpose = "ride_payment" }) {
  const receipt = `${purpose}_${Date.now()}`;
  const order = await razorpayClient().orders.create({
    amount: Math.round(amount * 100),
    currency: "INR",
    receipt,
    notes: { userId: String(userId), rideId: rideId ? String(rideId) : "", purpose }
  });

  const payment = await Payment.create({
    user: userId,
    ride: rideId,
    amount,
    method: "razorpay",
    provider: "razorpay",
    status: "pending",
    razorpay: { orderId: order.id, receipt }
  });

  return { order, payment };
}

export function verifyRazorpaySignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac("sha256", env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpayWebhookSecret) return false;
  const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
  return expected === signature;
}

export async function markPaymentPaid({ orderId, paymentId, signature }) {
  const isValid = verifyRazorpaySignature({ orderId, paymentId, signature });
  if (!isValid) {
    const error = new Error("Invalid Razorpay signature");
    error.statusCode = 400;
    throw error;
  }
  return Payment.findOneAndUpdate(
    { "razorpay.orderId": orderId },
    { status: "paid", providerReference: paymentId, "razorpay.paymentId": paymentId, "razorpay.signature": signature },
    { new: true }
  );
}

export async function getOrCreateWallet(userId) {
  return Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, balance: 0 } },
    { new: true, upsert: true }
  );
}

export async function creditWallet({ userId, amount, payment, reason = "wallet_topup" }) {
  const wallet = await getOrCreateWallet(userId);
  wallet.balance += amount;
  wallet.lastTransactionAt = new Date();
  await wallet.save();
  const transaction = await Transaction.create({
    wallet: wallet._id,
    user: userId,
    payment,
    type: "credit",
    amount,
    balanceAfter: wallet.balance,
    reason
  });
  return { wallet, transaction };
}

export async function debitWallet({ userId, amount, ride, reason = "ride_payment" }) {
  const wallet = await getOrCreateWallet(userId);
  if (wallet.isFrozen || wallet.balance < amount) {
    const error = new Error("Insufficient wallet balance");
    error.statusCode = 402;
    throw error;
  }
  wallet.balance -= amount;
  wallet.lastTransactionAt = new Date();
  await wallet.save();
  const payment = await Payment.create({ user: userId, ride, amount, method: "wallet", provider: "wallet", status: "paid" });
  const transaction = await Transaction.create({
    wallet: wallet._id,
    user: userId,
    payment: payment._id,
    ride,
    type: "debit",
    amount,
    balanceAfter: wallet.balance,
    reason
  });
  return { wallet, payment, transaction };
}

export async function refundRazorpayPayment(payment, amount, reason) {
  const refund = await razorpayClient().payments.refund(payment.providerReference, {
    amount: Math.round(amount * 100),
    notes: { reason }
  });
  payment.status = "refunded";
  payment.refund = { amount, reason, status: "processed", providerReference: refund.id };
  await payment.save();
  return { payment, refund };
}
