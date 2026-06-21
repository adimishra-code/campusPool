import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import hpp from "hpp";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/error.middleware.js";
import { mongoSanitize } from "./middleware/sanitize.middleware.js";
import { makeRateLimitStore } from "./config/redis.js";
import { configureOAuth, passport } from "./services/oauth.service.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import ratingRoutes from "./routes/rating.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import supportRoutes from "./routes/support.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import mapsRoutes from "./routes/maps.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import verificationRoutes from "./routes/verification.routes.js";
import featureFlagRoutes from "./routes/featureFlag.routes.js";
import vehicleRoutes from "./routes/vehicle.routes.js";
import tripRoutes from "./routes/trip.routes.js";
import collegeRoutes from "./routes/college.routes.js";
import safetyRoutes from "./routes/safety.routes.js";

const app = express();

// Behind nginx/Docker, trust the first proxy hop so rate-limit keys on the real
// client IP (X-Forwarded-For) rather than the proxy's.
app.set("trust proxy", 1);

// This API serves JSON only (plus OAuth 302 redirects), so it should never be a
// source for scripts, frames or other content — lock the CSP down to nothing.
// The SPA's own CSP (for scripts/styles/maps) lives in client/nginx.conf.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"]
      }
    }
  })
);
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser()); // parse the httpOnly auth cookie into req.cookies
app.use(hpp()); // collapse duplicated query/body params (HTTP parameter pollution)
app.use(mongoSanitize); // strip MongoDB operator keys ($, dotted) from input
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, store: makeRateLimitStore("global") }));

// Passport (stateless) — only needed when Google OAuth is configured.
if (configureOAuth()) app.use(passport.initialize());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "campuspool-api" });
});

// Auth & User routes (the strict auth limiter is applied per-route inside
// auth.routes.js to login/register/OTP, so frequent GET /me reads aren't hit).
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

// Vehicle routes
app.use("/api/vehicles", vehicleRoutes);

// Trip routes (carpool/ride-share core)
app.use("/api/trips", tripRoutes);

// Colleges (campus directory)
app.use("/api/colleges", collegeRoutes);

// Safety / SOS
app.use("/api/safety", safetyRoutes);

// Verification routes
app.use("/api/verification", verificationRoutes);

// Feature flags
app.use("/api/features", featureFlagRoutes);

// Payment & Ratings
app.use("/api/payments", paymentRoutes);
app.use("/api/ratings", ratingRoutes);

// Notifications & Support
app.use("/api/notifications", notificationRoutes);
app.use("/api/support", supportRoutes);

// Maps & Location
app.use("/api/maps", mapsRoutes);

// Analytics
app.use("/api/analytics", analyticsRoutes);

// Admin
app.use("/api/admin", adminRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
