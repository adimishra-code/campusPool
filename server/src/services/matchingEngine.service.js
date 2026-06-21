import Trip from "../models/Trip.js";
import MatchCache from "../models/MatchCache.js";
import { routeProximity } from "../utils/geospatial.js";

/**
 * Intelligent ride matching engine.
 *
 * A match score (0-100) between a user and a trip is the weighted sum of:
 *   route   (40)  pickup + destination proximity to the trip's route
 *   timing  (20)  closeness of the trip's departure to the reference time
 *   trust   (15)  host verification + trust score
 *   hostel  (10)  same hostel (10) / same college (5) bonus
 *   rating  (10)  host's average rating
 *   seats   (5)   has available seats
 * Maximum = 100.
 */
const WEIGHTS = { route: 40, timing: 20, trust: 15, hostel: 10, rating: 10, seats: 5 };
const CACHE_MINUTES = 10;

const norm = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const HOST_FIELDS =
  "name avatarUrl hostel college trustScore ratingAverage ratingCount verificationStatus reliabilityStats";
const VEHICLE_FIELDS = "make model color seats amenities";

// ---- Timing -------------------------------------------------------------
function timingScore(departureTime, referenceTime) {
  const diffMin = Math.abs(new Date(departureTime) - new Date(referenceTime)) / 60000;
  if (diffMin <= 15) return 100;
  if (diffMin <= 30) return 70;
  if (diffMin <= 60) return 40;
  if (diffMin <= 180) return 20;
  return 5;
}

// ---- Host reliability (0-100) -------------------------------------------
export function computeHostReliability(host = {}) {
  const verif = host.verificationStatus === "approved" ? 25 : 0;
  const trust = Math.min(100, host.trustScore ?? 50) * 0.3; // max 30
  const rating = host.ratingCount > 0 ? ((host.ratingAverage ?? 5) / 5) * 25 : 15; // max 25
  const completedTrips = host.reliabilityStats?.totalTrips ?? 0;
  const completed = (Math.min(completedTrips, 20) / 20) * 20; // max 20
  return Math.round(verif + trust + rating + completed);
}

export function hostReliabilityLabel(score) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "New";
}

// ---- Core score ----------------------------------------------------------
/**
 * @param {object} user  the requesting user (hostel, college, preferences)
 * @param {object} trip  a trip with populated host + coordinates
 * @param {object} context { pickup:[lng,lat], destination:[lng,lat], referenceTime:Date }
 * @returns {{ score:number, breakdown:object }}
 */
export function calculateMatchScore(user = {}, trip = {}, context = {}) {
  const host = trip.host || {};
  const tripPickup = trip.pickup?.coordinates?.coordinates;
  const tripDest = trip.destination?.coordinates?.coordinates;

  // route
  const rp = routeProximity(
    context.pickup || null,
    context.destination || null,
    tripPickup,
    tripDest
  );
  const route = Math.round((rp.score / 100) * WEIGHTS.route);

  // timing
  const ref = context.referenceTime ? new Date(context.referenceTime) : new Date();
  const timing = Math.round((timingScore(trip.departureTime, ref) / 100) * WEIGHTS.timing);

  // hostel / college
  let hostelPct = 0;
  if (user.hostel && host.hostel && norm(user.hostel) === norm(host.hostel)) hostelPct = 100;
  else if (user.college && host.college && String(user.college) === String(host.college))
    hostelPct = 50;
  const hostel = Math.round((hostelPct / 100) * WEIGHTS.hostel);

  // trust = verification (8) + trust score (7)
  const verifPts = host.verificationStatus === "approved" ? 8 : 0;
  const trust = Math.round(verifPts + (Math.min(100, host.trustScore ?? 50) / 100) * 7);

  // rating
  const rating =
    host.ratingCount > 0 ? Math.round(((host.ratingAverage ?? 5) / 5) * WEIGHTS.rating) : 7;

  // seats
  const seats = (trip.seatsAvailable ?? 0) > 0 ? WEIGHTS.seats : 0;

  const score = Math.min(100, route + timing + trust + hostel + rating + seats);
  return { score, breakdown: { route, timing, trust, hostel, rating, seats } };
}

export function recommendationReason(breakdown) {
  const reasons = [];
  if (breakdown.route >= 32) reasons.push("On your route");
  else if (breakdown.route >= 20) reasons.push("Route partly overlaps");
  if (breakdown.timing >= 14) reasons.push("Departs around your time");
  if (breakdown.hostel >= 10) reasons.push("Same hostel");
  else if (breakdown.hostel >= 5) reasons.push("Same college");
  if (breakdown.trust >= 12) reasons.push("Trusted host");
  return reasons.join(" · ") || "Suggested for you";
}

// ---- Ranking -------------------------------------------------------------
function rank(user, trips, context) {
  return trips
    .map((trip) => {
      const { score, breakdown } = calculateMatchScore(user, trip, context);
      if (trip.host) {
        trip.host.hostReliability = computeHostReliability(trip.host);
        trip.host.hostReliabilityLabel = hostReliabilityLabel(trip.host.hostReliability);
      }
      return {
        trip,
        matchScore: score,
        breakdown,
        recommendationReason: recommendationReason(breakdown)
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

// Joinable trips for a given user (not their own, not already joined, seats free, in the future).
function candidateQuery(user, extra = {}) {
  return {
    status: { $in: ["offered", "open"] },
    departureTime: { $gte: new Date() },
    host: { $ne: user._id },
    "passengers.user": { $ne: user._id },
    seatsAvailable: { $gt: 0 },
    ...extra
  };
}

// ---- Public: search ranking (fresh, not cached) --------------------------
export async function searchAndRank(
  user,
  { date, pickup, destination, referenceTime, limit = 20 } = {}
) {
  const extra = {};
  if (date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    extra.departureTime = { $gte: new Date(Math.max(Date.now(), start.getTime())), $lte: end };
  }
  const trips = await Trip.find(candidateQuery(user, extra))
    .populate("host", HOST_FIELDS)
    .populate("vehicle", VEHICLE_FIELDS)
    .limit(80)
    .lean();

  return rank(user, trips, { pickup, destination, referenceTime }).slice(0, limit);
}

// ---- Public: recommendations (cached 10 min) -----------------------------
async function readCache(userId) {
  const docs = await MatchCache.find({ user: userId, expiresAt: { $gt: new Date() } })
    .sort("-score")
    .lean();
  if (!docs.length) return [];
  const ids = docs.map((d) => d.trip);
  const trips = await Trip.find({
    _id: { $in: ids },
    status: { $in: ["offered", "open"] },
    seatsAvailable: { $gt: 0 }
  })
    .populate("host", HOST_FIELDS)
    .populate("vehicle", VEHICLE_FIELDS)
    .lean();
  const map = new Map(trips.map((t) => [String(t._id), t]));
  return docs
    .filter((d) => map.has(String(d.trip)))
    .map((d) => {
      const trip = map.get(String(d.trip));
      if (trip.host) {
        trip.host.hostReliability = computeHostReliability(trip.host);
        trip.host.hostReliabilityLabel = hostReliabilityLabel(trip.host.hostReliability);
      }
      return {
        trip,
        matchScore: d.score,
        breakdown: d.breakdown,
        recommendationReason: d.recommendationReason
      };
    });
}

export async function getRecommendations(user, { limit = 10 } = {}) {
  const cached = await readCache(user._id);
  if (cached.length) return { items: cached.slice(0, limit), cached: true };

  const ranked = await searchAndRank(user, { limit: limit * 3 });
  const top = ranked.slice(0, Math.max(limit, 10));
  // Cache each recommendation for 10 minutes.
  for (const item of top) {
    await MatchCache.getOrCache(
      user._id,
      item.trip._id,
      item.matchScore,
      item.breakdown,
      item.recommendationReason,
      {},
      CACHE_MINUTES
    );
  }
  return { items: top.slice(0, limit), cached: false };
}

// ---- Public: single trip score ------------------------------------------
export async function getMatchScoreForTrip(user, tripId, context = {}) {
  const trip = await Trip.findById(tripId).populate("host", HOST_FIELDS).lean();
  if (!trip) return null;
  const { score, breakdown } = calculateMatchScore(user, trip, context);
  return {
    score,
    breakdown,
    recommendationReason: recommendationReason(breakdown),
    hostReliability: computeHostReliability(trip.host || {}),
    hostReliabilityLabel: hostReliabilityLabel(computeHostReliability(trip.host || {}))
  };
}

// Was this trip recommended to (cached for) this user? Used for conversion analytics.
export async function wasRecommended(userId, tripId) {
  const doc = await MatchCache.findOne({
    user: userId,
    trip: tripId,
    expiresAt: { $gt: new Date() }
  }).lean();
  return !!doc;
}

export async function invalidateForTrip(tripId) {
  return MatchCache.invalidateForTrip(tripId);
}
