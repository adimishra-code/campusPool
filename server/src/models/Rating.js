import mongoose from "mongoose";

/**
 * Trip-scoped rating.
 * Phase 1: converted from the legacy Ride reference to Trip. Because a trip
 * has one host and many passengers, the unique key is (trip, fromUser, toUser)
 * so a host can rate each passenger and each passenger can rate the host once.
 */
const ratingSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Role of the person being rated, for clarity / future filtering.
    role: { type: String, enum: ["host", "passenger"] },
    score: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, maxlength: 500 }
  },
  { timestamps: true }
);

// One rating per (trip, rater, ratee) pair.
ratingSchema.index({ trip: 1, fromUser: 1, toUser: 1 }, { unique: true });

export default mongoose.model("Rating", ratingSchema);
