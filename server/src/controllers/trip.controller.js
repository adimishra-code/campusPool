import { body, param, query } from "express-validator";
import Trip from "../models/Trip.js";
import Vehicle from "../models/Vehicle.js";
import RouteTemplate from "../models/RouteTemplate.js";
import ImpactStats from "../models/ImpactStats.js";
import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { estimateDistanceAndDuration } from "../services/fare.service.js";

export const offerTripRules = [
  body("pickup.address").trim().notEmpty().isLength({ max: 200 }),
  body("pickup.coordinates.coordinates").isArray({ min: 2, max: 2 }),
  body("destination.address").trim().notEmpty().isLength({ max: 200 }),
  body("destination.coordinates.coordinates").isArray({ min: 2, max: 2 }),
  body("departureTime").isISO8601(),
  body("vehicleId").isMongoId(),
  body("costPerPerson").isFloat({ min: 0 }),
  body("seats").optional().isInt({ min: 2, max: 8 }),
  body("recurringDays").optional().isArray(),
  body("notes").optional().trim().isLength({ max: 500 }),
  body("cancellationPolicy").optional().isIn(["strict", "flexible", "moderate"])
];

export const tripIdRule = [param("id").isMongoId()];

export const findTripsRules = [
  query("pickupLat").optional().isFloat(),
  query("pickupLng").optional().isFloat(),
  query("destLat").optional().isFloat(),
  query("destLng").optional().isFloat(),
  query("radiusKm").optional().isInt({ min: 1, max: 50 }),
  query("date").optional().isISO8601(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 50 })
];

// Estimate trip cost
export const estimateTrip = asyncHandler(async (req, res) => {
  const { pickup, destination, seats = 4 } = req.body;

  // Try to get cached route
  let routeData;
  const routeTemplate = await RouteTemplate.findNearby(pickup.coordinates.coordinates, 5);

  if (routeTemplate && routeTemplate.length > 0) {
    const cached = routeTemplate[0];
    routeData = {
      distanceKm: cached.distance.value / 1000,
      durationMin: Math.round(cached.duration.value / 60),
      polyline: cached.routePolyline
    };
  } else {
    routeData = estimateDistanceAndDuration(pickup, destination);
  }

  // Calculate carbon saved (avg car emits 0.21 kg CO2/km)
  const carbonSaved = Math.round(routeData.distanceKm * 0.21 * (seats - 1) * 100) / 100;

  // Base cost calculation
  const baseRate = 20; // INR
  const perKm = 8;
  const costPerPerson = Math.round(
    (baseRate + routeData.distanceKm * perKm) / Math.max(1, seats - 1)
  );

  res.json({
    distanceKm: Math.round(routeData.distanceKm * 10) / 10,
    durationMin: Math.round(routeData.durationMin),
    costPerPerson,
    totalCost: costPerPerson * (seats - 1),
    carbonSavedKg: carbonSaved
  });
});

// Offer a new trip
export const offerTrip = asyncHandler(async (req, res) => {
  const {
    pickup,
    destination,
    departureTime,
    vehicleId,
    costPerPerson,
    seats = 4,
    recurringDays,
    notes,
    cancellationPolicy = "moderate"
  } = req.body;

  // Verify vehicle belongs to user and is verified
  const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: req.user._id });
  if (!vehicle) {
    const error = new Error("Vehicle not found or does not belong to you");
    error.statusCode = 404;
    throw error;
  }

  if (vehicle.verificationStatus !== "approved") {
    const error = new Error("Vehicle must be verified before offering rides");
    error.statusCode = 400;
    throw error;
  }

  // Calculate distance and duration
  const routeData = estimateDistanceAndDuration(pickup, destination);

  // Create trip
  const trip = await Trip.create({
    host: req.user._id,
    vehicle: vehicleId,
    pickup,
    destination,
    departureTime: new Date(departureTime),
    seatsTotal: seats,
    seatsAvailable: seats - 1, // Host doesn't count as passenger
    rideType: seats > 2 ? "carpool" : "solo",
    distanceKm: routeData.distanceKm,
    durationMin: routeData.durationMin,
    costPerPerson,
    totalCost: costPerPerson * (seats - 1),
    carbonSavedKg: Math.round(routeData.distanceKm * 0.21 * (seats - 1) * 100) / 100,
    recurringDays,
    notes,
    cancellationPolicy,
    status: "offered",
    timeline: [
      {
        status: "offered",
        note: "Trip offered"
      }
    ]
  });

  // Cache route template
  if (pickup && destination) {
    RouteTemplate.findOrCreate(
      pickup,
      destination,
      routeData.polyline,
      { value: routeData.distanceKm * 1000, text: `${routeData.distanceKm} km` },
      { value: routeData.durationMin * 60, text: `${routeData.durationMin} min` }
    ).catch(console.error);
  }

  // Log action
  await AuditLog.log("trip.offer", "Trip", trip._id, req.user._id, {
    pickup: pickup.address,
    destination: destination.address
  });

  res.status(201).json({
    message: "Trip offered successfully",
    trip: {
      id: trip._id,
      status: trip.status,
      departureTime: trip.departureTime,
      costPerPerson: trip.costPerPerson,
      seatsAvailable: trip.seatsAvailable
    }
  });
});

// Find available trips ranked by match score.
export const findTrips = asyncHandler(async (req, res) => {
  const { pickupLat, pickupLng, destLat, destLng, date, page = 1, limit = 20 } = req.query;

  const pickup = pickupLat && pickupLng ? [parseFloat(pickupLng), parseFloat(pickupLat)] : null;
  const destination = destLat && destLng ? [parseFloat(destLng), parseFloat(destLat)] : null;

  const ranked = await searchAndRank(req.user, { date, pickup, destination, limit: 80 });

  const start = (page - 1) * limit;
  const pageItems = ranked.slice(start, start + Number(limit));
  const trips = pageItems.map((m) => ({
    ...m.trip,
    matchScore: m.matchScore,
    breakdown: m.breakdown,
    recommendationReason: m.recommendationReason
  }));

  res.json({
    trips,
    total: ranked.length,
    page: parseInt(page),
    pages: Math.ceil(ranked.length / limit)
  });
});

// Get trip details (with host reliability + the viewer's match score).
export const getTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id)
    .populate(
      "host",
      "name avatarUrl hostel college trustScore trustBreakdown ratingAverage ratingCount verificationStatus reliabilityStats phone"
    )
    .populate("vehicle", "make model color seats amenities")
    .populate("passengers.user", "name avatarUrl hostel trustScore")
    .lean();

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  if (trip.host) {
    const reliability = computeHostReliability(trip.host);
    trip.host.hostReliability = reliability;
    trip.host.hostReliabilityLabel = hostReliabilityLabel(reliability);
  }

  const match = calculateMatchScore(req.user, trip, {});

  // Gate PII: only the host, an approved/completed passenger, or an admin may see
  // the host's phone number and the passenger roster. Everyone else gets a
  // sanitised view (the match score above doesn't depend on these fields).
  const viewerId = req.user._id.toString();
  const isHost = trip.host?._id?.toString() === viewerId;
  const isAdmin = req.user.role === "admin";
  const isParticipant =
    isHost ||
    (trip.passengers || []).some(
      (p) => p.user?._id?.toString() === viewerId && ["approved", "completed"].includes(p.status)
    );
  if (!isParticipant && !isAdmin) {
    if (trip.host) delete trip.host.phone;
    trip.passengers = [];
  }

  res.json({ trip, match });
});

// Join a trip (request to join)
export const joinTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  // Check if user is the host
  if (trip.host.toString() === req.user._id.toString()) {
    const error = new Error("Cannot join your own trip");
    error.statusCode = 400;
    throw error;
  }

  // Check trip status
  if (!["offered", "open"].includes(trip.status)) {
    const error = new Error("Trip is not accepting passengers");
    error.statusCode = 400;
    throw error;
  }

  // Check if already a passenger
  const existing = trip.passengers.find((p) => p.user.toString() === req.user._id.toString());
  if (existing) {
    const error = new Error("Already a passenger or requested to join");
    error.statusCode = 400;
    throw error;
  }

  // Record a recommendation conversion if this trip had been recommended to the user.
  if (await wasRecommended(req.user._id, trip._id)) {
    MatchEvent.record("recommendation_join", req.user._id, trip._id);
  }

  await trip.addPassenger(req.user._id, req.body.notes || "");
  await invalidateForTrip(trip._id);

  await AuditLog.log("trip.join", "Trip", trip._id, req.user._id, { host: trip.host });

  res.json({
    message: "Request to join sent",
    status: "pending"
  });
});

// Host approves passenger
export const approvePassenger = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  // Verify host
  if (trip.host.toString() !== req.user._id.toString()) {
    const error = new Error("Only the host can approve passengers");
    error.statusCode = 403;
    throw error;
  }

  await trip.approvePassenger(req.params.userId);
  await invalidateForTrip(trip._id);

  await AuditLog.log("trip.approve", "Trip", trip._id, req.user._id, {
    passenger: req.params.userId
  });

  res.json({
    message: "Passenger approved",
    seatsAvailable: trip.seatsAvailable
  });
});

// Host rejects passenger
export const rejectPassenger = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  if (trip.host.toString() !== req.user._id.toString()) {
    const error = new Error("Only the host can reject passengers");
    error.statusCode = 403;
    throw error;
  }

  const { reason } = req.body;
  await trip.rejectPassenger(req.params.userId, reason);
  await invalidateForTrip(trip._id);

  res.json({
    message: "Passenger rejected"
  });
});

// Leave/cancel participation
export const leaveTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  const passenger = trip.passengers.find((p) => p.user.toString() === req.user._id.toString());
  if (!passenger) {
    const error = new Error("Not a passenger on this trip");
    error.statusCode = 400;
    throw error;
  }

  if (passenger.status === "approved") {
    passenger.status = "cancelled";
    trip.seatsAvailable += 1;
  } else {
    trip.passengers = trip.passengers.filter((p) => p.user.toString() !== req.user._id.toString());
  }

  trip.timeline.push({
    status: "passenger_left",
    note: "Passenger left",
    by: req.user._id
  });

  await trip.save();
  await invalidateForTrip(trip._id);

  res.json({ message: "Left trip successfully" });
});

// Cancel trip (host only)
export const cancelTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  if (trip.host.toString() !== req.user._id.toString()) {
    const error = new Error("Only the host can cancel the trip");
    error.statusCode = 403;
    throw error;
  }

  const { reason } = req.body;
  await trip.cancel(req.user._id, reason);
  await invalidateForTrip(trip._id);

  await AuditLog.log("trip.cancel", "Trip", trip._id, req.user._id, { reason });

  res.json({
    message: "Trip cancelled"
  });
});

// Start trip
export const startTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  if (trip.host.toString() !== req.user._id.toString()) {
    const error = new Error("Only the host can start the trip");
    error.statusCode = 403;
    throw error;
  }

  await trip.start();

  res.json({
    message: "Trip started",
    status: trip.status
  });
});

// Complete trip
export const completeTrip = asyncHandler(async (req, res) => {
  const trip = await Trip.findById(req.params.id);

  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  if (trip.host.toString() !== req.user._id.toString()) {
    const error = new Error("Only the host can complete the trip");
    error.statusCode = 403;
    throw error;
  }

  await trip.complete();
  await invalidateForTrip(trip._id);

  // Update impact stats for host
  const hostStats = await ImpactStats.getOrCreate(trip.host);
  await hostStats.recordAsHost(trip.distanceKm, trip.carbonSavedKg, trip.totalCost);

  // Update impact stats for passengers
  for (const passenger of trip.passengers.filter((p) => p.status === "completed")) {
    const passengerStats = await ImpactStats.getOrCreate(passenger.user);
    await passengerStats.recordAsPassenger(
      trip.distanceKm / trip.passengers.filter((p) => p.status === "approved").length,
      trip.carbonSavedKg / trip.passengers.filter((p) => p.status === "approved").length,
      trip.costPerPerson
    );
  }

  await AuditLog.log("trip.complete", "Trip", trip._id, req.user._id, {
    passengers: trip.passengers.filter((p) => p.status === "approved").length
  });

  res.json({
    message: "Trip completed",
    carbonSavedKg: trip.carbonSavedKg,
    totalCost: trip.totalCost
  });
});

// Get my trips (as host and as passenger)
export const getMyTrips = asyncHandler(async (req, res) => {
  const { role, status, page = 1, limit = 20 } = req.query;

  let hostTrips = [];
  let passengerTrips = [];

  // Trips where I'm host
  if (!role || role === "host") {
    const hostQuery = { host: req.user._id };
    if (status) hostQuery.status = status;
    hostTrips = await Trip.find(hostQuery)
      .populate("vehicle", "make model color")
      .sort("-departureTime")
      .limit(parseInt(limit));
  }

  // Trips where I'm passenger
  if (!role || role === "passenger") {
    const passengerQuery = { "passengers.user": req.user._id };
    if (status) {
      passengerQuery["passengers.status"] = status;
    }
    passengerTrips = await Trip.find(passengerQuery)
      .populate("host", "name avatarUrl hostel")
      .populate("vehicle", "make model color")
      .sort("-departureTime")
      .limit(parseInt(limit));
  }

  res.json({
    hostTrips,
    passengerTrips,
    total: hostTrips.length + passengerTrips.length,
    page: parseInt(page)
  });
});

// Validation for a manual status update.
export const tripStatusRules = [
  body("status")
    .isIn([
      "draft",
      "offered",
      "open",
      "full",
      "departed",
      "in_progress",
      "completed",
      "cancelled",
      "no_show"
    ])
    .withMessage("Invalid status"),
  body("note").optional().trim().isLength({ max: 500 })
];

// Allowed lifecycle transitions for a manual status update. Terminal states
// (completed / cancelled / no_show) cannot transition further. Trips are created
// "offered" and remain joinable as offered/open/full; "departed" means started.
const STATUS_TRANSITIONS = {
  draft: ["offered", "cancelled"],
  offered: ["open", "full", "departed", "cancelled"],
  open: ["offered", "full", "departed", "cancelled"],
  full: ["open", "departed", "cancelled"],
  departed: ["completed", "no_show", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: []
};

// Update trip status — host or admin only, with lifecycle-transition enforcement.
export const updateTripStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const trip = await Trip.findById(req.params.id);
  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  // Only the host or an admin may change a trip's status.
  const isHost = trip.host.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";
  if (!isHost && !isAdmin) {
    const error = new Error("Only the host or an admin can update trip status");
    error.statusCode = 403;
    throw error;
  }

  // Enforce a valid lifecycle transition from the current status.
  const allowed = STATUS_TRANSITIONS[trip.status] || [];
  if (status !== trip.status && !allowed.includes(status)) {
    const error = new Error(`Cannot change status from "${trip.status}" to "${status}"`);
    error.statusCode = 400;
    throw error;
  }

  trip.status = status;
  trip.timeline.push({ status, note, by: req.user._id });

  // Keep terminal-state side-effects consistent with the dedicated methods.
  if (status === "completed") {
    trip.completedAt = trip.completedAt || new Date();
    trip.passengers.forEach((p) => {
      if (p.status === "approved") p.status = "completed";
    });
  }
  if (status === "cancelled" && !trip.cancellation?.cancelledAt) {
    trip.cancellation = { by: req.user._id, reason: note, cancelledAt: new Date() };
  }

  await trip.save();
  await invalidateForTrip(trip._id);

  res.json({ trip });
});

import {
  searchAndRank,
  getRecommendations as recommend,
  getMatchScoreForTrip,
  calculateMatchScore,
  computeHostReliability,
  hostReliabilityLabel,
  invalidateForTrip,
  wasRecommended
} from "../services/matchingEngine.service.js";
import MatchEvent from "../models/MatchEvent.js";

const coordFromQuery = (lng, lat) => (lng && lat ? [parseFloat(lng), parseFloat(lat)] : null);

// Get matching trips for an explicit route (ranked)
export const getMatchingTrips = asyncHandler(async (req, res) => {
  const { pickupLat, pickupLng, destLat, destLng, departureTime, limit = 20 } = req.query;
  const items = await searchAndRank(req.user, {
    pickup: coordFromQuery(pickupLng, pickupLat),
    destination: coordFromQuery(destLng, destLat),
    referenceTime: departureTime || undefined,
    limit: parseInt(limit)
  });
  res.json({ matches: items, count: items.length });
});

// Get smart recommendations (cached 10 min) + record a "view" event
export const getRecommendations = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const { items, cached } = await recommend(req.user, { limit: parseInt(limit) });
  MatchEvent.record("recommendation_view", req.user._id, null, { count: items.length });
  res.json({ recommendations: items, count: items.length, cached });
});

// Get match score for a specific trip (optionally against the passenger's route)
export const getTripMatchScore = asyncHandler(async (req, res) => {
  const { tripId } = req.params;
  const { pickupLat, pickupLng, destLat, destLng } = req.query;
  const matchData = await getMatchScoreForTrip(req.user, tripId, {
    pickup: coordFromQuery(pickupLng, pickupLat),
    destination: coordFromQuery(destLng, destLat)
  });
  if (!matchData) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }
  res.json(matchData);
});

// Record a recommendation click (recommendation funnel analytics)
export const trackRecommendationClick = asyncHandler(async (req, res) => {
  await MatchEvent.record("recommendation_click", req.user._id, req.params.id, {
    matchScore: req.body?.matchScore
  });
  res.json({ ok: true });
});
