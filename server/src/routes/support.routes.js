import { Router } from "express";
import {
  createTicket,
  createTicketRules,
  listTickets,
  replyTicket
} from "../controllers/support.controller.js";
import { protect, optionalAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = Router();

// Bug reports & support tickets can be submitted by authenticated users OR guests
router.post("/", optionalAuth, validate(createTicketRules), createTicket);

// Managing and replying to tickets requires authentication
router.get("/", protect, listTickets);
router.post("/:id/replies", protect, replyTicket);

export default router;
