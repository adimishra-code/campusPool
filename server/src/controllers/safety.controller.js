import { body } from "express-validator";
import SosEvent from "../models/SosEvent.js";
import Report from "../models/Report.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { notifyUser } from "../services/notification.service.js";
import { recomputeSafetyScore } from "../services/safety.service.js";
import { sendSafetyAlertEmail } from "../services/email.service.js";
import { sendSmsBulk } from "../services/sms.service.js";
import { signShareToken, verifyShareToken } from "../utils/token.js";
import { env } from "../config/env.js";

export const sosRules = [
  body("location").optional().isArray({ min: 2, max: 2 }),
  body("note").optional().trim().isLength({ max: 300 })
];

// Host or approved/completed passenger may raise an SOS for a trip.
function isParticipant(trip, userId) {
  const id = userId.toString();
  if (trip.host.toString() === id) return true;
  return trip.passengers.some(
    (p) => p.user.toString() === id && ["approved", "completed"].includes(p.status)
  );
}

// POST /api/trips/:id/sos
export const triggerSos = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id).select("host passengers pickup destination");
  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }
  if (!isParticipant(trip, req.user._id)) {
    const error = new Error("Only trip participants can raise an SOS for this trip");
    error.statusCode = 403;
    throw error;
  }

  const { location, note } = req.body;
  const contacts = (req.user.emergencyContacts || []).map((c) => ({
    name: c.name,
    phone: c.phone
  }));

  // Everyone on the trip except the person raising the alarm.
  const recipients = [
    trip.host,
    ...trip.passengers
      .filter((p) => ["approved", "completed"].includes(p.status))
      .map((p) => p.user)
  ]
    .map(String)
    .filter((id) => id !== req.user._id.toString());
  const uniqueRecipients = [...new Set(recipients)];

  const sos = await SosEvent.create({
    user: req.user._id,
    trip: trip._id,
    location: location ? { type: "Point", coordinates: location } : undefined,
    notifiedUsers: uniqueRecipients,
    notifiedContacts: contacts
  });

  const io = req.app.get("io");
  const alert = {
    sosId: String(sos._id),
    trip: String(trip._id),
    user: { id: String(req.user._id), name: req.user.name },
    location: location || null,
    note: note || null,
    at: new Date()
  };

  // In-app alerts to co-travellers.
  for (const userId of uniqueRecipients) {
    await notifyUser(io, userId, {
      title: "🚨 SOS alert",
      message: `${req.user.name} raised an SOS on your shared trip.`,
      type: "sos",
      metadata: { trip: trip._id, sos: sos._id, location: location || null }
    });
  }

  // Realtime to admin ops and anyone watching the trip room.
  if (io) {
    io.to("admin:ops").emit("sos:alert", alert);
    io.to(`trip:${trip._id}`).emit("sos:alert", alert);
  }

  // Email the user and campus operations (real delivery via SMTP when
  // configured, otherwise logged). Fire-and-forget so the response isn't
  // blocked on mail delivery.
  const where = location ? ` Last location: ${location[1]}, ${location[0]}.` : "";
  const body = `${req.user.name} raised an emergency SOS alert on a shared CampusPool trip.${where}`;
  sendSafetyAlertEmail([req.user.email, env.supportEmail], {
    subject: `🚨 CampusPool SOS — ${req.user.name}`,
    text: body,
    html: `<p><strong>🚨 CampusPool SOS alert</strong></p><p>${body}</p>`
  }).catch(() => {});

  // SMS alert to emergency contacts when configured
  if (contacts.length) {
    const contactPhones = contacts.map((c) => c.phone).filter(Boolean);
    sendSmsBulk(contactPhones, `🚨 CampusPool SOS: ${body}`).catch(() => {});
  }

  res.status(201).json({
    message: "SOS raised. Trip members and operations have been alerted.",
    sos: {
      id: sos._id,
      status: sos.status,
      notifiedParticipants: uniqueRecipients.length,
      notifiedContacts: contacts.length
    }
  });
});

// ---------------------------------------------------------------------------
// Check-ins & safe-arrival confirmation (trip-scoped, participant-gated)
// ---------------------------------------------------------------------------

export const checkInRules = [
  body("location").optional().isArray({ min: 2, max: 2 }),
  body("note").optional().trim().isLength({ max: 200 })
];

async function loadTripForSafety(tripId) {
  const trip = await Trip.findById(tripId).select("host passengers safety status");
  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }
  return trip;
}

function ensureParticipant(trip, userId) {
  if (!isParticipant(trip, userId)) {
    const error = new Error("Only trip participants can do this");
    error.statusCode = 403;
    throw error;
  }
}

// POST /api/trips/:id/check-in — a participant logs an en-route check-in.
export const checkIn = asyncHandler(async (req, res) => {
  const trip = await loadTripForSafety(req.params.id);
  ensureParticipant(trip, req.user._id);

  const { location, note } = req.body;
  trip.safety.checkIns.push({
    user: req.user._id,
    coordinates: location || undefined,
    note: note || undefined,
    at: new Date()
  });
  await trip.save();

  const io = req.app.get("io");
  const payload = {
    trip: String(trip._id),
    user: { id: String(req.user._id), name: req.user.name },
    coordinates: location || null,
    note: note || null,
    at: new Date()
  };
  if (io) io.to(`trip:${trip._id}`).emit("trip:checkin", payload);

  res.status(201).json({ message: "Check-in recorded", checkInCount: trip.safety.checkIns.length });
});

// POST /api/trips/:id/confirm-arrival — a participant confirms the trip arrived safely.
export const confirmArrival = asyncHandler(async (req, res) => {
  const trip = await loadTripForSafety(req.params.id);
  ensureParticipant(trip, req.user._id);

  if (trip.safety.arrivalConfirmedAt) {
    return res.json({
      message: "Arrival already confirmed",
      arrivalConfirmedAt: trip.safety.arrivalConfirmedAt
    });
  }

  trip.safety.arrivalConfirmedAt = new Date();
  trip.safety.arrivalConfirmedBy = req.user._id;
  await trip.save();

  // Confirmed safe arrivals improve the host's safety compliance score.
  await recomputeSafetyScore(trip.host);

  const io = req.app.get("io");
  if (io) {
    io.to(`trip:${trip._id}`).emit("trip:arrived", {
      trip: String(trip._id),
      by: { id: String(req.user._id), name: req.user.name },
      at: trip.safety.arrivalConfirmedAt
    });
  }

  res.json({
    message: "Safe arrival confirmed",
    arrivalConfirmedAt: trip.safety.arrivalConfirmedAt
  });
});

// POST /api/safety/sos/:id/resolve — by the raiser or an admin.
export const resolveSos = asyncHandler(async (req, res) => {
  const sos = await SosEvent.findById(req.params.id);
  if (!sos) {
    const error = new Error("SOS event not found");
    error.statusCode = 404;
    throw error;
  }
  if (req.user.role !== "admin" && sos.user.toString() !== req.user._id.toString()) {
    const error = new Error("Not allowed to resolve this SOS");
    error.statusCode = 403;
    throw error;
  }
  sos.status = "resolved";
  sos.resolvedAt = new Date();
  sos.resolvedBy = req.user._id;
  await sos.save();

  const io = req.app.get("io");
  if (io) io.to("admin:ops").emit("sos:resolved", { sosId: String(sos._id) });

  res.json({ message: "SOS resolved", sos: { id: sos._id, status: sos.status } });
});

// GET /api/safety/sos/active — admin operations queue.
export const listActiveSos = asyncHandler(async (_req, res) => {
  const events = await SosEvent.find({ status: "active" })
    .populate("user", "name phone hostel")
    .populate("trip", "pickup destination")
    .sort("-createdAt");
  res.json({ events });
});

// ---------------------------------------------------------------------------
// External trip sharing (signed expiring token, public read-only view)
// ---------------------------------------------------------------------------

// POST /api/trips/:id/share — a participant mints a shareable, expiring link.
export const createShareLink = asyncHandler(async (req, res) => {
  const trip = await loadTripForSafety(req.params.id);
  ensureParticipant(trip, req.user._id);

  const token = signShareToken(trip._id);
  res.status(201).json({
    message: "Share link created. It expires automatically.",
    url: `${env.clientUrl}/share/${token}`,
    token,
    expiresIn: env.shareTokenExpiresIn
  });
});

// GET /api/safety/share/:token — public, no auth. Returns a sanitized,
// read-only snapshot of the trip for a guardian following along.
export const getSharedTrip = asyncHandler(async (req, res) => {
  let decoded;
  try {
    decoded = verifyShareToken(req.params.token);
  } catch (err) {
    const error = new Error(
      err.name === "TokenExpiredError" ? "This share link has expired" : "Invalid share link"
    );
    error.statusCode = err.statusCode || 401;
    throw error;
  }

  const trip = await Trip.findById(decoded.tripId)
    .select("host pickup destination departureTime status safety")
    .populate("host", "name");
  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  const checkIns = trip.safety?.checkIns || [];
  const lastCheckIn = checkIns[checkIns.length - 1];

  // Minimal PII: host first name only, route addresses, status, latest location.
  res.json({
    trip: {
      host: trip.host?.name ? trip.host.name.split(" ")[0] : "Host",
      pickup: trip.pickup?.address,
      destination: trip.destination?.address,
      departureTime: trip.departureTime,
      status: trip.status,
      arrivalConfirmedAt: trip.safety?.arrivalConfirmedAt || null,
      lastKnownLocation: lastCheckIn?.coordinates || null,
      lastCheckInAt: lastCheckIn?.at || null
    }
  });
});

// ---------------------------------------------------------------------------
// User reporting
// ---------------------------------------------------------------------------

export const reportRules = [
  body("reportedUser").isMongoId().withMessage("reportedUser is required"),
  body("category").isIn([
    "harassment",
    "unsafe_driving",
    "no_show",
    "inappropriate_behavior",
    "fraud",
    "other"
  ]),
  body("description").trim().isLength({ min: 5, max: 1000 }),
  body("trip").optional().isMongoId()
];

// POST /api/safety/reports — file a safety report against another user.
export const createReport = asyncHandler(async (req, res) => {
  const { reportedUser, category, description, trip } = req.body;

  if (reportedUser === req.user._id.toString()) {
    const error = new Error("You cannot report yourself");
    error.statusCode = 400;
    throw error;
  }

  const target = await User.findById(reportedUser).select("_id name");
  if (!target) {
    const error = new Error("Reported user not found");
    error.statusCode = 404;
    throw error;
  }

  const report = await Report.create({
    reporter: req.user._id,
    reportedUser,
    category,
    description,
    trip: trip || undefined
  });

  // Pending reports nudge the reported user's safety score down provisionally.
  await recomputeSafetyScore(reportedUser);

  const io = req.app.get("io");
  if (io) {
    io.to("admin:ops").emit("report:new", {
      reportId: String(report._id),
      category,
      reportedUser: { id: String(target._id), name: target.name },
      at: report.createdAt
    });
  }

  res.status(201).json({
    message: "Report submitted. Campus operations will review it.",
    report: { id: report._id, status: report.status }
  });
});

// GET /api/safety/reports — admin queue (optional ?status= filter).
export const listReports = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  const reports = await Report.find(filter)
    .populate("reporter", "name email")
    .populate("reportedUser", "name email safetyScore")
    .populate("trip", "pickup destination departureTime")
    .sort("-createdAt");
  res.json({ reports });
});

// POST /api/safety/reports/:id/resolve — admin sets the outcome.
export const resolveReport = asyncHandler(async (req, res) => {
  const { status, resolution } = req.body;
  if (!["reviewing", "actioned", "dismissed"].includes(status)) {
    const error = new Error("status must be one of: reviewing, actioned, dismissed");
    error.statusCode = 400;
    throw error;
  }

  const report = await Report.findById(req.params.id);
  if (!report) {
    const error = new Error("Report not found");
    error.statusCode = 404;
    throw error;
  }

  report.status = status;
  report.resolution = resolution;
  if (status === "actioned" || status === "dismissed") {
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
  }
  await report.save();

  // An actioned/dismissed report changes the reported user's safety score.
  await recomputeSafetyScore(report.reportedUser);

  res.json({ message: "Report updated", report: { id: report._id, status: report.status } });
});
