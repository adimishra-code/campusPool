import mongoose from "mongoose";
const matchCacheSchema = new mongoose.Schema(
  {
    // User requesting the match
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    // Trip being matched against
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
      index: true
    },

    // Match score (0-100)
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },

    // Breakdown of score
    breakdown: {
      route: Number,
      time: Number,
      trust: Number,
      preferences: Number
    },

    // Human-readable explanation
    recommendationReason: {
      type: String
    },

    // When this cache expires (indexed via the TTL index below)
    expiresAt: {
      type: Date,
      required: true
    },

    // Search parameters that generated this match
    searchParams: {
      pickup: mongoose.Schema.Types.Mixed,
      destination: mongoose.Schema.Types.Mixed,
      date: Date,
      radiusKm: Number
    }
  },
  { timestamps: true }
);

// Compound index for efficient lookups
matchCacheSchema.index({ user: 1, trip: 1 }, { unique: true });
matchCacheSchema.index({ user: 1, expiresAt: 1 });

// TTL index to auto-delete expired entries (also serves as the expiresAt index)
matchCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to get or create cache
matchCacheSchema.statics.getOrCache = async function (
  userId,
  tripId,
  score,
  breakdown,
  reason,
  searchParams,
  ttlMinutes = 30
) {
  const existing = await this.findOne({
    user: userId,
    trip: tripId,
    expiresAt: { $gt: new Date() }
  });

  if (existing) {
    return existing;
  }

  return this.findOneAndUpdate(
    { user: userId, trip: tripId },
    {
      user: userId,
      trip: tripId,
      score,
      breakdown,
      recommendationReason: reason,
      searchParams,
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000)
    },
    { upsert: true, new: true }
  );
};

// Static method to get cached matches for a user
matchCacheSchema.statics.getCachedMatches = async function (userId, searchParams = null) {
  const query = {
    user: userId,
    expiresAt: { $gt: new Date() }
  };

  // If search params provided, try to match
  if (searchParams) {
    // For now, just return any valid cached matches
    // In production, would match against searchParams
  }

  return this.find(query)
    .populate("trip", "pickup destination departureTime costPerPerson status")
    .sort("-score")
    .limit(20);
};

// Static method to invalidate cache for a trip
matchCacheSchema.statics.invalidateForTrip = async function (tripId) {
  return this.deleteMany({ trip: tripId });
};

// Static method to invalidate cache for a user
matchCacheSchema.statics.invalidateForUser = async function (userId) {
  return this.deleteMany({ user: userId });
};

// Static method to clean up expired entries
matchCacheSchema.statics.cleanup = async function () {
  return this.deleteMany({ expiresAt: { $lte: new Date() } });
};

export default mongoose.model("MatchCache", matchCacheSchema);
