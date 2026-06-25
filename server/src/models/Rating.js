import mongoose from "mongoose";

/**
 * Trip-scoped rating.
 *
 * Each rating is mapped to a specific trip, fromUser, and toUser.
 * This structure allows a host to rate each passenger and each passenger
 * to rate the host once per trip.
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
