import { asyncHandler } from "../utils/asyncHandler.js";
import { platformAnalytics, safetyAnalytics } from "../services/analytics.service.js";
import AnalyticsEvent from "../models/AnalyticsEvent.js";

// Ingest a client-side analytics event (page view / user interaction). Public
// but attributes the signed-in user when a token is present (optionalAuth).
// Fire-and-forget on the client; we always 202 quickly.
export const trackEvent = asyncHandler(async (req, res) => {
  const { type, path, referrer, sessionId, meta } = req.body || {};
  if (typeof type === "string" && type.length <= 60) {
    AnalyticsEvent.record({
      type,
      user: req.user?._id,
      path: typeof path === "string" ? path.slice(0, 300) : undefined,
      referrer: typeof referrer === "string" ? referrer.slice(0, 300) : undefined,
      sessionId: typeof sessionId === "string" ? sessionId.slice(0, 80) : undefined,
      meta: meta && typeof meta === "object" ? meta : undefined
    });
  }
  res.status(202).json({ ok: true });
});

export const analyticsOverview = asyncHandler(async (req, res) => {
  const analytics = await platformAnalytics({ from: req.query.from, to: req.query.to });
  res.json(analytics);
});

export const safetyOverview = asyncHandler(async (req, res) => {
  const analytics = await safetyAnalytics({ from: req.query.from, to: req.query.to });
  res.json(analytics);
});
