import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["ride", "payment", "promo", "support", "sos", "system"],
      default: "system"
    },
    channel: { type: String, enum: ["in_app", "push", "sms", "email"], default: "in_app" },
    readAt: Date,
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

export default mongoose.model("Notification", notificationSchema);
