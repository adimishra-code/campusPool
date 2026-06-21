import { Router } from "express";
import { dashboard, listUsers, listTrips, refundPayment } from "../controllers/admin.controller.js";
import { authorize, protect } from "../middleware/auth.middleware.js";

const router = Router();

router.use(protect, authorize("admin"));

// Campus KPIs
router.get("/dashboard", dashboard);

// User management
router.get("/users", listUsers);

// Trip management
router.get("/trips", listTrips);

// Payment/settlement refund (verification approvals live under /api/verification/admin)
router.post("/payments/:id/refund", refundPayment);

export default router;
