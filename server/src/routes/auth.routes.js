import { Router } from "express";
import {
  login, loginRules, me, register, registerRules, requestOtp, verifyOtp, logout,
  verifyEmail, verifyEmailRules, resendVerification, verifyLoginOtp,
  forgotPassword, resetPassword, resetPasswordRules, emailRule, setTwoFactor
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import {
  authLimiter, loginLimiter, passwordResetLimiter, otpVerifyLimiter, otpRequestLimiter
} from "../middleware/rateLimit.middleware.js";
import { signToken } from "../utils/token.js";
import { configureOAuth, passport } from "../services/oauth.service.js";
import { env } from "../config/env.js";

const router = Router();

router.post("/register", authLimiter, registerRules, validate, register);
router.post("/login", authLimiter, loginLimiter, loginRules, validate, login);

// Email verification (hard login gate)
router.post("/verify-email", otpVerifyLimiter, verifyEmailRules, validate, verifyEmail);
router.post("/resend-verification", otpRequestLimiter, emailRule, validate, resendVerification);

// Login 2FA challenge
router.post("/login/verify-otp", otpVerifyLimiter, verifyEmailRules, validate, verifyLoginOtp);

// Password reset
router.post("/forgot-password", passwordResetLimiter, emailRule, validate, forgotPassword);
router.post("/reset-password", passwordResetLimiter, resetPasswordRules, validate, resetPassword);

// Phone OTP
router.post("/otp/request", authLimiter, requestOtp);
router.post("/otp/verify", otpVerifyLimiter, verifyOtp);

// Session
router.get("/me", protect, me);
router.post("/logout", protect, logout);
router.patch("/2fa", protect, setTwoFactor);

// ---- Google OAuth (mounted only when configured) -------------------------
if (configureOAuth()) {
  router.get("/google", passport.authenticate("google", { scope: ["profile", "email"], session: false }));
  router.get(
    "/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: `${env.clientUrl}/login?oauth=failed` }),
    (req, res) => {
      const token = signToken(req.user);
      // Hand the token back to the SPA, which persists it and routes onward.
      res.redirect(`${env.clientUrl}/login?token=${token}`);
    }
  );
}

export default router;
