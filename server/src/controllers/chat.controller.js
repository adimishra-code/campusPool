import { body } from "express-validator";
import Message from "../models/Message.js";
import Trip from "../models/Trip.js";
import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const sendMessageRules = [body("body").trim().isLength({ min: 1, max: 2000 })];

// A user may access a trip's chat if they are the host or an approved/completed passenger.
function canAccess(trip, userId) {
  const id = userId.toString();
  if (trip.host.toString() === id) return true;
  return trip.passengers.some(
    (p) => p.user.toString() === id && ["approved", "completed"].includes(p.status)
  );
}

async function loadTripOrThrow(tripId) {
  const trip = await Trip.findById(tripId).select("host passengers");
  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }
  return trip;
}

function ensureAccess(trip, userId) {
  if (!canAccess(trip, userId)) {
    const error = new Error("You are not a participant of this trip");
    error.statusCode = 403;
    throw error;
  }
}

// GET /api/trips/:id/messages — list messages + mark incoming ones read.
export const listMessages = asyncHandler(async (req, res) => {
  const trip = await loadTripOrThrow(req.params.id);
  ensureAccess(trip, req.user._id);

  const messages = await Message.find({ trip: trip._id })
    .populate("sender", "name avatarUrl")
    .sort("createdAt")
    .limit(200)
    .lean();

  // Mark messages from others as read by me.
  await Message.updateMany(
    { trip: trip._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );

  const io = req.app.get("io");
  if (io) io.to(`trip:${trip._id}`).emit("chat:read", { tripId: String(trip._id), userId: String(req.user._id) });

  res.json({ messages });
});

// POST /api/trips/:id/messages — send a message and broadcast it live.
export const sendMessage = asyncHandler(async (req, res) => {
  const trip = await loadTripOrThrow(req.params.id);
  ensureAccess(trip, req.user._id);

  const created = await Message.create({ trip: trip._id, sender: req.user._id, body: req.body.body, readBy: [req.user._id] });
  const message = await Message.findById(created._id).populate("sender", "name avatarUrl").lean();

  const io = req.app.get("io");
  if (io) io.to(`trip:${trip._id}`).emit("chat:message", { tripId: String(trip._id), message });

  await AuditLog.log("message.send", "Message", created._id, req.user._id, { trip: trip._id });

  res.status(201).json({ message });
});
