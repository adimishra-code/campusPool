import { Router } from "express";
import {
  login,
  loginRules,
  me,
  register,
  registerRules,
  requestOtp,
  verifyOtp,
  logout,
  verifyEmail,
  verifyEmailRules,
  resendVerification,
  verifyLoginOtp,
  forgotPassword,
  resetPassword,
  resetPasswordRules,
  emailRule,
  setTwoFactor,
  otpRequestRules,
  otpVerifyRules
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validation.middleware.js";
import {
  authLimiter,
  loginLimiter,
  passwordResetLimiter,
  otpVerifyLimiter,
  otpRequestLimiter
} from "../middleware/rateLimit.middleware.js";
import { signToken } from "../utils/token.js";
import { setAuthCookie } from "../utils/cookies.js";
import { configureOAuth, passport } from "../services/oauth.service.js";
import { env } from "../config/env.js";

const router = Router();

router.post("/register", authLimiter, validate(registerRules), register);
router.post("/login", authLimiter, loginLimiter, validate(loginRules), login);

// Email verification (hard login gate)
router.post("/verify-email", otpVerifyLimiter, validate(verifyEmailRules), verifyEmail);
router.post("/resend-verification", otpRequestLimiter, validate(emailRule), resendVerification);

// Login 2FA challenge
router.post("/login/verify-otp", otpVerifyLimiter, validate(verifyEmailRules), verifyLoginOtp);

// Password reset
router.post("/forgot-password", passwordResetLimiter, validate(emailRule), forgotPassword);
router.post("/reset-password", passwordResetLimiter, validate(resetPasswordRules), resetPassword);

// Phone OTP
router.post("/otp/request", authLimiter, validate(otpRequestRules), requestOtp);
router.post("/otp/verify", otpVerifyLimiter, validate(otpVerifyRules), verifyOtp);

// Session
router.get("/me", protect, me);
router.post("/logout", protect, logout);
router.patch("/2fa", protect, setTwoFactor);

// ---- Google OAuth (mounted only when configured) -------------------------
if (configureOAuth()) {
  router.get(
    "/google",
    passport.authenticate("google", { scope: ["profile", "email"], session: false })
  );
  router.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect: `${env.clientUrl}/login?oauth=failed`
    }),
    (req, res) => {
      // Set the session as an httpOnly cookie instead of putting the token in
      // the redirect URL (which would leak it via browser history, the Referer
      // header and server logs). The SPA hydrates the session via GET /auth/me.
      setAuthCookie(res, signToken(req.user));
      res.redirect(`${env.clientUrl}/login?oauth=success`);
    }
  );
}

export default router;
