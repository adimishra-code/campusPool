import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    ride: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
    type: { type: String, enum: ["credit", "debit", "refund", "adjustment"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    status: { type: String, enum: ["pending", "success", "failed"], default: "success", index: true },
    reason: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("Transaction", transactionSchema);
