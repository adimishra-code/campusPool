import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

// Strict limiter for credential/OTP endpoints (login, register, OTP request) to
// blunt credential stuffing and OTP spam. Applied per-route — NOT to the whole
// /api/auth router — so frequent authed reads like GET /me aren't throttled.
// Disabled under tests; threshold tunable via AUTH_RATE_LIMIT.
export const authLimiter = env.nodeEnv === "test"
  ? (_req, _res, next) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.authRateLimit,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: "Too many attempts. Please try again later." }
    });

// Factory so every sensitive endpoint gets its own per-IP bucket. Bypassed under
// tests (where express-rate-limit's in-memory store would leak across cases).
function makeLimiter({ windowMs, limit, message }) {
  if (env.nodeEnv === "test") return (_req, _res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message }
  });
}

// Password-attempt guard: tighter than authLimiter and layered ON TOP of the
// per-account lockout (User.registerFailedLogin) for defense in depth.
export const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.loginRateLimit,
  message: "Too many login attempts. Please try again later."
});

// Forgot/reset password — low cap per IP per hour to blunt token guessing & spam.
export const passwordResetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: env.passwordResetRateLimit,
  message: "Too many password reset requests. Please try again later."
});

// OTP verification attempts (email verify, login 2FA, phone) — paired with the
// per-code attempt cap that invalidates a code after repeated wrong guesses.
export const otpVerifyLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.otpVerifyRateLimit,
  message: "Too many verification attempts. Please request a new code."
});

// Re-sending OTPs (resend verification) — keep it scarce to prevent mail bombing.
export const otpRequestLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: env.otpRequestRateLimit,
  message: "Too many code requests. Please wait before trying again."
});

export default authLimiter;
