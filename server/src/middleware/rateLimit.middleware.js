import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { makeRateLimitStore } from "../config/redis.js";

// Strict limiter for credential/OTP endpoints
export const authLimiter =
  env.nodeEnv === "test"
    ? (_req, _res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: env.authRateLimit,
        standardHeaders: true,
        legacyHeaders: false,
        store: makeRateLimitStore("auth"),
        message: { message: "Too many attempts. Please try again later." }
      });

function makeLimiter({ windowMs, limit, message, suffix }) {
  if (env.nodeEnv === "test") {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeRateLimitStore(suffix),
    message: { message }
  });
}

export const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.loginRateLimit,
  suffix: "login",
  message: "Too many login attempts. Please try again later."
});

export const passwordResetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: env.passwordResetRateLimit,
  suffix: "reset",
  message: "Too many password reset requests. Please try again later."
});

export const otpVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.otpVerifyRateLimit,
  suffix: "otpverify",
  message: "Too many verification attempts. Please request a new code."
});

export const otpRequestLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.otpRequestRateLimit,
  suffix: "otprequest",
  message: "Too many code requests. Please wait before trying again."
});

export default authLimiter;
