import { body } from "express-validator";
import Rating from "../models/Rating.js";
import Trip from "../models/Trip.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const createRatingRules = [
  body("trip").isMongoId(),
  body("toUser").isMongoId(),
  body("score").isInt({ min: 1, max: 5 }),
  body("review").optional().trim().isLength({ max: 500 })
];

// Returns true if userId is a legitimate participant of the trip
// (the host, or an approved/completed passenger).
function isParticipant(trip, userId) {
  const id = userId.toString();
  if (trip.host.toString() === id) return true;
  return trip.passengers.some(
    (p) => p.user.toString() === id && ["approved", "completed"].includes(p.status)
  );
}

export const createRating = asyncHandler(async (req, res) => {
  const { trip: tripId, toUser, score, review } = req.body;

  if (req.user._id.toString() === toUser.toString()) {
    const error = new Error("You cannot rate yourself");
    error.statusCode = 400;
    throw error;
  }

  const trip = await Trip.findById(tripId);
  if (!trip) {
    const error = new Error("Trip not found");
    error.statusCode = 404;
    throw error;
  }

  // Both the rater and the ratee must belong to the trip.
  if (!isParticipant(trip, req.user._id) || !isParticipant(trip, toUser)) {
    const error = new Error("Both users must be participants of this trip");
    error.statusCode = 403;
    throw error;
  }

  const role = trip.host.toString() === toUser.toString() ? "host" : "passenger";

  let rating;
  try {
    rating = await Rating.create({
      trip: tripId,
      fromUser: req.user._id,
      toUser,
      role,
      score,
      review
    });
  } catch (err) {
    if (err?.code === 11000) {
      const dup = new Error("You have already rated this user for this trip");
      dup.statusCode = 409;
      throw dup;
    }
    throw err;
  }

  // Recompute the ratee's aggregate rating.
  const stats = await Rating.aggregate([
    { $match: { toUser: rating.toUser } },
    { $group: { _id: "$toUser", average: { $avg: "$score" }, count: { $sum: 1 } } }
  ]);
  await User.findByIdAndUpdate(rating.toUser, {
    ratingAverage: Number((stats[0]?.average || 5).toFixed(2)),
    ratingCount: stats[0]?.count || 0
  });

  res.status(201).json({ rating });
});
