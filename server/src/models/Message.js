import mongoose from "mongoose";

// A trip's chat message. The "conversation" is the trip itself — every message
// is scoped to a trip and visible only to its participants (host + approved
// passengers). readBy tracks read receipts.
const messageSchema = new mongoose.Schema(
  {
    trip: { type: mongoose.Schema.Types.ObjectId, ref: "Trip", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  },
  { timestamps: true }
);

messageSchema.index({ trip: 1, createdAt: 1 });

export default mongoose.model("Message", messageSchema);
