import { Router } from "express";
import { createTicket, createTicketRules, listTickets, replyTicket } from "../controllers/support.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";

const router = Router();

router.use(protect);
router.post("/", createTicketRules, validate, createTicket);
router.get("/", listTickets);
router.post("/:id/replies", replyTicket);

export default router;
