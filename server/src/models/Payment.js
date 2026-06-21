import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    ride: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    method: { type: String, enum: ["cash", "upi", "card", "wallet", "razorpay"], required: true },
    status: { type: String, enum: ["pending", "authorized", "paid", "failed", "refunded"], default: "pending" },
    provider: { type: String, enum: ["manual", "razorpay", "wallet"], default: "manual" },
    providerReference: String,
    razorpay: {
      orderId: String,
      paymentId: String,
      signature: String,
      receipt: String
    },
    failure: {
      reason: String,
      recoverable: { type: Boolean, default: true },
      recoveryUrl: String
    },
    refund: {
      amount: Number,
      reason: String,
      status: { type: String, enum: ["requested", "approved", "rejected", "processed"] },
      providerReference: String
    },
    receiptUrl: String
  },
  { timestamps: true }
);

paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ "razorpay.orderId": 1 });

export default mongoose.model("Payment", paymentSchema);
