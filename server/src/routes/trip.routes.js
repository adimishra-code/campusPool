import express from "express";
import { param } from "express-validator";
import {
  estimateTrip,
  offerTrip,
  findTrips,
  getTrip,
  joinTrip,
  approvePassenger,
  rejectPassenger,
  leaveTrip,
  cancelTrip,
  startTrip,
  completeTrip,
  getMyTrips,
  updateTripStatus,
  tripStatusRules,
  offerTripRules,
  tripIdRule,
  findTripsRules,
  getMatchingTrips,
  getRecommendations,
  getTripMatchScore,
  trackRecommendationClick
} from "../controllers/trip.controller.js";
import { listMessages, sendMessage, sendMessageRules } from "../controllers/chat.controller.js";
import {
  triggerSos,
  sosRules,
  checkIn,
  checkInRules,
  confirmArrival,
  createShareLink
} from "../controllers/safety.controller.js";
import {
  getTripPaymentInfo,
  settleTripShare,
  settleRules
} from "../controllers/payment.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = express.Router();

// Trip estimation
router.post("/estimate", protect, estimateTrip);

// Offer a new trip
router.post("/offer", protect, authorize("host", "admin"), validate(offerTripRules), offerTrip);

// Find trips
router.get("/find", protect, validate(findTripsRules, ["query"]), findTrips);

// Get matching trips (smart matching)
router.get("/matching", protect, getMatchingTrips);

// Get smart recommendations
router.get("/recommendations", protect, getRecommendations);

// Get match score for a specific trip
router.get("/match-score/:tripId", protect, getTripMatchScore);

// Record a recommendation click (analytics funnel)
router.post("/:id/click", protect, trackRecommendationClick);

// Trip chat (participant-only; access enforced in the controller)
router.get("/:id/messages", protect, validate(tripIdRule), listMessages);
router.post("/:id/messages", protect, validate([...tripIdRule, ...sendMessageRules]), sendMessage);

// Trip safety — raise an SOS (participant-only; access enforced in the controller)
router.post("/:id/sos", protect, validate([...tripIdRule, ...sosRules]), triggerSos);

// Trip safety — en-route check-in and safe-arrival confirmation (participant-only)
router.post("/:id/check-in", protect, validate([...tripIdRule, ...checkInRules]), checkIn);
router.post("/:id/confirm-arrival", protect, validate(tripIdRule), confirmArrival);

// Trip safety — create an external read-only share link (participant-only)
router.post("/:id/share", protect, validate(tripIdRule), createShareLink);

// Trip payment — peer-to-peer settlement (cash / direct UPI QR to the host)
router.get("/:id/payment", protect, validate(tripIdRule), getTripPaymentInfo);
router.post("/:id/settle", protect, validate([...tripIdRule, ...settleRules]), settleTripShare);

// Get my trips
router.get("/my-trips", protect, getMyTrips);

// Get trip by ID
router.get("/:id", protect, validate(tripIdRule), getTrip);

// Join trip
router.post("/:id/join", protect, validate(tripIdRule), joinTrip);

// Leave trip
router.post("/:id/leave", protect, validate(tripIdRule), leaveTrip);

// Cancel trip
router.post("/:id/cancel", protect, validate(tripIdRule), cancelTrip);

// Start trip
router.post("/:id/start", protect, validate(tripIdRule), startTrip);

// Complete trip
router.post("/:id/complete", protect, validate(tripIdRule), completeTrip);

// Update status (host or admin only; lifecycle transitions enforced in the controller)
router.patch(
  "/:id/status",
  protect,
  validate([...tripIdRule, ...tripStatusRules]),
  updateTripStatus
);

// Passenger management (host only)
const passengerActionRule = [...tripIdRule, param("userId").isMongoId().withMessage("Invalid user ID")];
router.post("/:id/approve/:userId", protect, validate(passengerActionRule), approvePassenger);
router.post("/:id/reject/:userId", protect, validate(passengerActionRule), rejectPassenger);

export default router;
