import Trip from "../models/Trip.js";
import { env } from "../config/env.js";
import { notifyUser } from "./notification.service.js";
import { sendSmsBulk } from "./sms.service.js";

// Expected arrival = explicit arrivalTime, else departureTime + planned duration.
function expectedArrival(trip) {
  if (trip.arrivalTime) return new Date(trip.arrivalTime).getTime();
  return new Date(trip.departureTime).getTime() + (trip.durationMin || 0) * 60000;
}

/**
 * One escalation pass: find started-but-unconfirmed trips whose expected
 * arrival (plus a grace period) has passed and which haven't been escalated
 * yet, then alert participants, campus ops, and emergency contacts — once.
 *
 * `now` is injectable for deterministic tests.
 */
export async function runArrivalEscalation({ io, now = new Date() } = {}) {
  const graceMs = env.arrivalGraceMinutes * 60000;

  const candidates = await Trip.find({
    status: { $in: ["departed", "in_progress"] },
    "safety.arrivalConfirmedAt": { $exists: false },
    "safety.arrivalEscalatedAt": { $exists: false },
    departureTime: { $lte: now }
  })
    .populate("host", "name phone emergencyContacts")
    .populate("passengers.user", "name emergencyContacts");

  let escalated = 0;

  for (const trip of candidates) {
    if (now.getTime() < expectedArrival(trip) + graceMs) continue;

    const approved = trip.passengers.filter((p) => ["approved", "completed"].includes(p.status));
    const participants = [trip.host, ...approved.map((p) => p.user)].filter(Boolean);
    const route = `${trip.pickup?.address || "pickup"} → ${trip.destination?.address || "destination"}`;

    // In-app notifications to everyone on the trip.
    for (const u of participants) {
      await notifyUser(io, u._id, {
        title: "⚠️ Safe-arrival check",
        message: `No one confirmed safe arrival for your trip (${route}). Please confirm you're okay.`,
        type: "sos",
        metadata: { trip: trip._id }
      });
    }

    // Realtime to campus operations.
    if (io) {
      io.to("admin:ops").emit("arrival:escalation", {
        trip: String(trip._id),
        host: { id: String(trip.host?._id), name: trip.host?.name },
        route,
        at: now
      });
    }

    // SMS the emergency contacts of every participant.
    const contactPhones = participants.flatMap((u) => (u.emergencyContacts || []).map((c) => c.phone));
    await sendSmsBulk(
      contactPhones,
      `CampusPool safety alert: no safe-arrival confirmation for a trip (${route}). Please check in on them.`
    );

    trip.safety.arrivalEscalatedAt = now;
    await trip.save();
    escalated += 1;
  }

  return { escalated, scanned: candidates.length };
}

// Periodic scheduler — started from index.js, never during tests.
export function startArrivalEscalationScheduler(io) {
  const intervalMs = env.arrivalScanIntervalSeconds * 1000;
  const timer = setInterval(() => {
    runArrivalEscalation({ io }).catch((err) => console.error(`[escalation] pass failed: ${err.message}`));
  }, intervalMs);
  timer.unref?.();
  return timer;
}
