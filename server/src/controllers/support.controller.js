import { body } from "express-validator";
import SupportTicket from "../models/SupportTicket.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSupportEmail, sendSupportConfirmation } from "../services/email.service.js";

export const createTicketRules = [
  body("subject").trim().notEmpty().isLength({ max: 160 }).withMessage("Subject is required"),
  body("message").trim().notEmpty().isLength({ max: 5000 }).withMessage("Message is required"),
  body("category")
    .optional()
    .isIn(["payment", "safety", "host", "passenger", "refund", "bug", "feedback", "other"]),
  body("ride").optional().isMongoId()
];

export const createTicket = asyncHandler(async (req, res) => {
  const { subject, message, category, ride, meta, email } = req.body;
  const user = req.user;
  const senderEmail = user?.email || email || "anonymous@campuspool.app";
  const senderName = user?.name || "CampusPool User / Guest";

  const ticket = await SupportTicket.create({
    subject,
    message,
    category,
    ride,
    user: user?._id || undefined,
    guestEmail: user ? undefined : senderEmail,
    priority: category === "bug" ? "high" : "medium"
  });

  // Notify support inbox (adityamishrav820@gmail.com) via Gmail relay / email service
  const who = user ? `${senderName} <${senderEmail}> (User ID: ${user._id})` : senderEmail;
  const detail = meta ? `\n\nContext & Device:\n${JSON.stringify(meta, null, 2)}` : "";
  const html = `<h2>🚨 New ${category === "bug" ? "Bug Report" : "Support Request"}</h2>
    <p><strong>From:</strong> ${who}</p>
    <p><strong>Subject:</strong> ${subject}</p>
    <p><strong>Category:</strong> ${category || "support"}</p>
    <p><strong>Ticket ID:</strong> ${ticket._id}</p>
    <hr/>
    <h3>Description:</h3>
    <div style="white-space: pre-wrap; background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-family: sans-serif;">${message}</div>
    ${meta ? `<h4>Device / Diagnostics:</h4><pre style="background: #f1f5f9; padding: 10px; border-radius: 4px; font-size: 12px;">${JSON.stringify(meta, null, 2)}</pre>` : ""}`;

  sendSupportEmail({
    subject: `[CampusPool ${category === "bug" ? "Bug Report" : "Support"}] ${subject}`,
    text: `New ${category || "support"} request from ${who}:\n\n${message}${detail}\n\nTicket: ${ticket._id}`,
    html,
    replyTo: senderEmail,
    name: `${senderName} via CampusPool`
  }).catch((err) => console.error("Support email failed:", err.message));

  if (senderEmail && senderEmail.includes("@") && !senderEmail.includes("anonymous")) {
    sendSupportConfirmation(senderEmail, ticket).catch(() => {});
  }

  res.status(201).json({ ticket });
});

export const listTickets = asyncHandler(async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { user: req.user._id };
  const tickets = await SupportTicket.find(filter).populate("user ride").sort("-createdAt");
  res.json({ tickets });
});

export const replyTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) {
    const error = new Error("Ticket not found");
    error.statusCode = 404;
    throw error;
  }

  // A ticket may only be replied to by its owner or an admin (support staff).
  const isAdmin = req.user.role === "admin";
  const isOwner = ticket.user.toString() === req.user._id.toString();
  if (!isAdmin && !isOwner) {
    const error = new Error("Not authorized to reply to this ticket");
    error.statusCode = 403;
    throw error;
  }

  ticket.replies.push({ by: req.user._id, message: req.body.message });
  // Only admins may change the ticket's workflow status.
  if (isAdmin && req.body.status) {
    ticket.status = req.body.status;
  }
  await ticket.save();

  res.json({ ticket });
});
