import { body } from "express-validator";
import Payment from "../models/Payment.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { buildUpiIntent, buildUpiQr } from "../services/payment.service.js";

export const listPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ user: req.user._id }).populate("ride").sort("-createdAt");
  res.json({ payments });
});

export const updatePaymentStatus = asyncHandler(async (req, res) => {
  const payment = await Payment.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, providerReference: req.body.providerReference },
    { new: true }
  );
  res.json({ payment });
});

// ---------------------------------------------------------------------------
// Peer-to-peer trip settlement — pay the host directly via UPI QR or cash.
// Mounted on the trip routes (participant-gated), not the admin payment routes.
// ---------------------------------------------------------------------------

export const settleRules = [
  body("method").isIn(["cash", "upi"]).withMessage("method must be 'cash' or 'upi'"),
  body("reference").optional().trim().isLength({ max: 100 })
];

function approvedPassengerIds(trip) {
  return trip.passengers
    .filter((p) => ["approved", "completed"].includes(p.status))
    .map((p) => p.user.toString());
}

function isHost(trip, userId) {
  return trip.host.toString() === userId.toString();
}

async function loadTrip(tripId) {
  const trip = await Trip.findById(tripId);
  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }
  return trip;
}

// Recompute Trip.paymentStatus from how many approved passengers have settled.
function refreshPaymentStatus(trip) {
  const owing = approvedPassengerIds(trip);
  const settled = (trip.splitDetails || []).filter((s) => s.settled && owing.includes(s.user.toString()));
  if (owing.length === 0) trip.paymentStatus = "pending";
  else if (settled.length >= owing.length) trip.paymentStatus = "settled";
  else if (settled.length > 0) trip.paymentStatus = "partial";
  else trip.paymentStatus = "pending";
}

// GET /api/trips/:id/payment — settlement info: amount, host VPA, UPI QR, status.
export const getTripPaymentInfo = asyncHandler(async (req, res) => {
  const trip = await loadTrip(req.params.id);
  const host = isHost(trip, req.user._id);
  const owing = approvedPassengerIds(trip);

  if (!host && !owing.includes(req.user._id.toString())) {
    const error = new Error("Only the host or an approved passenger can view payment info");
    error.statusCode = 403;
    throw error;
  }

  const hostUser = await User.findById(trip.host).select("name upiId");
  const amount = trip.costPerPerson;

  // UPI QR (only when the host has set a VPA) — for passengers paying online.
  let upi = null;
  if (hostUser?.upiId) {
    const intent = buildUpiIntent({
      vpa: hostUser.upiId,
      payeeName: hostUser.name,
      amount,
      note: `CampusPool trip ${trip._id}`
    });
    upi = { vpa: hostUser.upiId, intent, qr: await buildUpiQr(intent) };
  }

  // Each viewer sees their own settlement; the host sees the whole split.
  const splitFor = (uid) => (trip.splitDetails || []).find((s) => s.user.toString() === uid.toString());
  const mine = splitFor(req.user._id);

  res.json({
    amount,
    paymentStatus: trip.paymentStatus,
    host: { name: hostUser?.name, hasUpi: Boolean(hostUser?.upiId) },
    upi,
    mySettlement: mine ? { settled: mine.settled, method: mine.method, settledAt: mine.settledAt } : { settled: false },
    split: host
      ? (trip.splitDetails || []).map((s) => ({ user: s.user, amount: s.amount, settled: s.settled, method: s.method, settledAt: s.settledAt }))
      : undefined
  });
});

// POST /api/trips/:id/settle — an approved passenger records their payment to
// the host (cash handed over, or paid online via the host's UPI QR).
export const settleTripShare = asyncHandler(async (req, res) => {
  const trip = await loadTrip(req.params.id);
  const owing = approvedPassengerIds(trip);

  if (!owing.includes(req.user._id.toString())) {
    const error = new Error("Only an approved passenger can settle a share");
    error.statusCode = 403;
    throw error;
  }

  const { method, reference } = req.body;
  const amount = trip.costPerPerson;

  const existing = (trip.splitDetails || []).find((s) => s.user.toString() === req.user._id.toString());
  if (existing?.settled) {
    return res.json({ message: "Your share is already settled", paymentStatus: trip.paymentStatus });
  }

  // Record the payment to the host. Peer-to-peer cash/UPI is settled off-platform,
  // so the provider is "manual" and we simply log it as paid for the trail.
  const payment = await Payment.create({
    ride: trip._id,
    user: req.user._id,
    amount,
    method,
    provider: "manual",
    status: "paid",
    providerReference: reference
  });

  if (existing) {
    existing.settled = true;
    existing.method = method;
    existing.settledAt = new Date();
  } else {
    trip.splitDetails.push({ user: req.user._id, amount, settled: true, method, settledAt: new Date() });
  }

  refreshPaymentStatus(trip);
  await trip.save();

  res.status(201).json({
    message: method === "cash" ? "Cash payment recorded" : "UPI payment recorded",
    paymentStatus: trip.paymentStatus,
    payment: { id: payment._id, amount, method, status: payment.status }
  });
});
