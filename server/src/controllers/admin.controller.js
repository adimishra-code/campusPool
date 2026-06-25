import Payment from "../models/Payment.js";
import SupportTicket from "../models/SupportTicket.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import Verification from "../models/Verification.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Campus admin dashboard.
 * Reports campus ride-share KPIs and keeps user / trip / verification oversight.
 */
export const dashboard = asyncHandler(async (_req, res) => {
  const activeTripStatuses = ["offered", "open", "full", "departed", "in_progress"];

  const [
    students,
    hosts,
    verifiedUsers,
    activeTrips,
    completedTrips,
    pendingVerifications,
    openTickets
  ] = await Promise.all([
    User.countDocuments({ role: "student" }),
    User.countDocuments({ role: "host" }),
    User.countDocuments({ verificationStatus: "approved" }),
    Trip.countDocuments({ status: { $in: activeTripStatuses } }),
    Trip.countDocuments({ status: "completed" }),
    Verification.countDocuments({ status: { $in: ["pending", "partial"] } }),
    SupportTicket.countDocuments({ status: { $in: ["open", "assigned"] } })
  ]);

  res.json({
    students,
    hosts,
    verifiedUsers,
    activeTrips,
    completedTrips,
    pendingVerifications,
    openTickets
  });
});

// USER MANAGEMENT
export const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;
  const users = await User.find(filter).select("-password").sort("-createdAt").limit(100);
  res.json({ users });
});

// TRIP MANAGEMENT
export const listTrips = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  } else {
    filter.status = { $nin: ["completed", "cancelled"] };
  }
  const trips = await Trip.find(filter)
    .populate("host", "name email hostel trustScore")
    .populate("vehicle", "make model plateNumber")
    .sort("-createdAt")
    .limit(100);
  res.json({ trips });
});

// Refund a settlement/payment (kept — Payment model is retained for cost sharing).
export const refundPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findByIdAndUpdate(
    req.params.id,
    {
      status: "refunded",
      refund: { amount: req.body.amount, reason: req.body.reason, status: "processed" }
    },
    { new: true }
  );
  res.json({ payment });
});
