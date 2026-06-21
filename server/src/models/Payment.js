import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    ride: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    // Peer-to-peer settlement only: cash handed over, or paid via the host's UPI QR.
    method: { type: String, enum: ["cash", "upi"], required: true },
    status: { type: String, enum: ["pending", "paid", "refunded"], default: "pending" },
    provider: { type: String, enum: ["manual"], default: "manual" },
    providerReference: String,
    // Populated by the admin settlement-refund endpoint (POST /api/admin/payments/:id/refund).
    refund: {
      amount: Number,
      reason: String,
      status: { type: String, enum: ["requested", "approved", "rejected", "processed"] },
      providerReference: String
    }
  },
  { timestamps: true }
);

paymentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("Payment", paymentSchema);
