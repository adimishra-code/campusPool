import mongoose from "mongoose";

// Lightweight analytics events for the recommendation funnel:
//  recommendation_view  -> recommendations served (count = how many shown)
//  recommendation_click -> a recommended trip was opened
//  recommendation_join  -> a join happened on a trip that had been recommended
const matchEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
    type: {
      type: String,
      enum: ["recommendation_view", "recommendation_click", "recommendation_join"],
      required: true,
      index: true
    },
    matchScore: Number,
    count: { type: Number, default: 1 }
  },
  { timestamps: true }
);

matchEventSchema.index({ type: 1, createdAt: -1 });

matchEventSchema.statics.record = function (type, user, trip = null, extra = {}) {
  return this.create({ type, user, trip, ...extra }).catch(() => null);
};

export default mongoose.model("MatchEvent", matchEventSchema);
