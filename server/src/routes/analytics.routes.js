import { Router } from "express";
import {
  analyticsOverview,
  safetyOverview,
  trackEvent
} from "../controllers/analytics.controller.js";
import { authorize, protect, optionalAuth } from "../middleware/auth.middleware.js";

const router = Router();

// Public client-side event ingestion (page views / interactions). Declared
// before the admin guard below.
router.post("/track", optionalAuth, trackEvent);

router.use(protect, authorize("admin"));
router.get("/overview", analyticsOverview);
router.get("/safety", safetyOverview);

export default router;
