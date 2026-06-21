import mongoose from "mongoose";

// Generic product-analytics events: page views and user interactions sent from
// the client (gated behind cookie consent). Kept lightweight + capped-cardinality
// on `type`/`path`; arbitrary detail goes in `meta`.
const analyticsEventSchema = new mongoose.Schema(
  {
    // e.g. "page_view", "signup", "login", "trip_offer", "trip_join", "payment_settle"
    type: { type: String, required: true, maxlength: 60, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    path: { type: String, maxlength: 300 },
    referrer: { type: String, maxlength: 300 },
    sessionId: { type: String, maxlength: 80 },
    meta: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

analyticsEventSchema.index({ type: 1, createdAt: -1 });

analyticsEventSchema.statics.record = function record(doc) {
  return this.create(doc).catch(() => null);
};

export default mongoose.model("AnalyticsEvent", analyticsEventSchema);
