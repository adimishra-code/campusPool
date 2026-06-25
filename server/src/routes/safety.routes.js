import { Router } from "express";
import {
  resolveSos,
  listActiveSos,
  createReport,
  listReports,
  resolveReport,
  reportRules,
  getSharedTrip
} from "../controllers/safety.controller.js";
import { protect, authorize } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";

const router = Router();

// SOS
router.get("/sos/active", protect, authorize("admin"), listActiveSos);
router.post("/sos/:id/resolve", protect, resolveSos);

// User reporting
router.post("/reports", protect, validate(reportRules), createReport);
router.get("/reports", protect, authorize("admin"), listReports);
router.post("/reports/:id/resolve", protect, authorize("admin"), resolveReport);

// Public read-only shared-trip view (signed token, no authentication required)
router.get("/share/:token", getSharedTrip);

export default router;
