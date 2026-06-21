import mongoose from "mongoose";

const supportTicketSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    ride: { type: mongoose.Schema.Types.ObjectId, ref: "Trip" },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    category: { type: String, enum: ["payment", "safety", "driver", "rider", "refund", "bug", "feedback", "other"], default: "other" },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium", index: true },
    status: { type: String, enum: ["open", "assigned", "resolved", "closed"], default: "open", index: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    replies: [
      {
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        message: String,
        at: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

export default mongoose.model("SupportTicket", supportTicketSchema);
