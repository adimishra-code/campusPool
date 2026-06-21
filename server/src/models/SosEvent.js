import mongoose from "mongoose";

// A safety/SOS alert raised by a user, optionally tied to a trip.
const sosEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", index: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: undefined }
    },
    status: { type: String, enum: ["active", "resolved"], default: "active", index: true },
    // Snapshot of who was alerted.
    notifiedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    notifiedContacts: [{ name: String, phone: String }],
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

sosEventSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("SosEvent", sosEventSchema);
