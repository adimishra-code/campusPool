import { body } from "express-validator";
import SupportTicket from "../models/SupportTicket.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSupportEmail, sendSupportConfirmation } from "../services/email.service.js";

export const createTicketRules = [
  body("subject").trim().notEmpty().isLength({ max: 160 }).withMessage("Subject is required"),
  body("message").trim().notEmpty().isLength({ max: 5000 }).withMessage("Message is required"),
  body("category").optional().isIn(["payment", "safety", "driver", "rider", "refund", "bug", "feedback", "other"]),
  body("ride").optional().isMongoId()
];

export const createTicket = asyncHandler(async (req, res) => {
  const { subject, message, category, ride, meta } = req.body;
  const ticket = await SupportTicket.create({
    subject, message, category, ride,
    user: req.user._id,
    priority: category === "bug" ? "high" : undefined
  });

  // Notify the support inbox and confirm to the user (dev mode logs instead of
  // sending when SMTP isn't configured). Fire-and-forget — don't block the 201.
  const who = `${req.user.name} <${req.user.email}>`;
  const detail = meta ? `\n\nContext: ${JSON.stringify(meta)}` : "";
  sendSupportEmail({
    subject: `[${category || "support"}] ${subject}`,
    text: `New ${category || "support"} request from ${who}:\n\n${message}${detail}\n\nTicket: ${ticket._id}`
  }).catch((err) => console.error("Support email failed:", err.message));
  sendSupportConfirmation(req.user.email, ticket).catch((err) => console.error("Support confirmation failed:", err.message));

  res.status(201).json({ ticket });
});

export const listTickets = asyncHandler(async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { user: req.user._id };
  const tickets = await SupportTicket.find(filter).populate("user ride").sort("-createdAt");
  res.json({ tickets });
});

export const replyTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findByIdAndUpdate(
    req.params.id,
    {
      status: req.body.status || "assigned",
      $push: { replies: { by: req.user._id, message: req.body.message } }
    },
    { new: true }
  );
  res.json({ ticket });
});
