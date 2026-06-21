import mongoose from "mongoose";

// A user-on-user safety report, optionally tied to a shared trip. Reviewed by
// campus operations (admins). Feeds the reported user's safety score.
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", index: true },
    category: {
      type: String,
      enum: ["harassment", "unsafe_driving", "no_show", "inappropriate_behavior", "fraud", "other"],
      required: true
    },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["open", "reviewing", "actioned", "dismissed"],
      default: "open",
      index: true
    },
    resolution: { type: String, trim: true, maxlength: 1000 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    resolvedAt: Date
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reportedUser: 1, status: 1 });

export default mongoose.model("Report", reportSchema);
