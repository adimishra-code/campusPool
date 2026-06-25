import crypto from "crypto";
import { body } from "express-validator";
import User from "../models/User.js";
import Verification from "../models/Verification.js";
import FeatureFlag from "../models/FeatureFlag.js";
import College from "../models/College.js";
import AuditLog from "../models/AuditLog.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signToken, generateResetToken, hashResetToken } from "../utils/token.js";
import { setAuthCookie, clearAuthCookie } from "../utils/cookies.js";
import { issueOtp } from "./verification.controller.js";
import { env } from "../config/env.js";
import { sendLoginOtpEmail, sendPasswordResetEmail, sendOtpEmail } from "../services/email.service.js";

// Max wrong guesses for a single OTP code before it is invalidated.
const MAX_OTP_ATTEMPTS = 5;

export const registerRules = [
  body("name").trim().notEmpty().isLength({ max: 100 }),
  body("email").isEmail().normalizeEmail(),
  body("phone").trim().isLength({ min: 10, max: 15 }),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  // Admin is intentionally NOT allowed here — admin accounts are created manually.
  body("role").optional().isIn(["student", "host"]),
  body("studentId").optional().trim(),
  body("hostel").optional().trim()
];

export const loginRules = [body("email").isEmail().normalizeEmail(), body("password").notEmpty()];

export const emailRule = [body("email").isEmail().normalizeEmail()];
export const verifyEmailRules = [
  body("email").isEmail().normalizeEmail(),
  body("otp").trim().isLength({ min: 4, max: 8 })
];
export const resetPasswordRules = [
  body("email").isEmail().normalizeEmail(),
  body("token").trim().notEmpty(),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters")
];

// Phone OTP (request/verify) — validate the phone (and code) before hitting the DB.
export const otpRequestRules = [body("phone").trim().isLength({ min: 10, max: 15 })];
export const otpVerifyRules = [
  body("phone").trim().isLength({ min: 10, max: 15 }),
  body("code").trim().isLength({ min: 6, max: 6 }).isNumeric()
];

// Shape the user object returned to the client on a successful session.
function publicUser(user, college) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    studentId: user.studentId,
    hostel: user.hostel,
    avatarUrl: user.avatarUrl,
    verificationStatus: user.verificationStatus,
    emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    trustScore: user.trustScore,
    preferences: user.preferences,
    ...(college ? { college: { id: college._id, name: college.name } } : {})
  };
}

// Issue an email login-2FA challenge code (5-min validity) on the user record.
async function issueLoginOtp(user) {
  const code = String(crypto.randomInt(100000, 1000000));
  user.otp = { code, expiresAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0 };
  await user.save();
  await sendLoginOtpEmail(user.email, code).catch((err) =>
    console.error("Login OTP email failed:", err.message)
  );
  // Never echo OTPs in production / when real mail is configured.
  return !env.mailConfigured && env.nodeEnv !== "production" ? code : undefined;
}

// Register new user. Issues an email verification code but does NOT return a
// session token — the account email must be verified before login (hard gate).
export const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role = "student", studentId, hostel } = req.body;

  // SECURITY: never allow self-service admin accounts. Admins are created manually.
  const safeRole = role === "host" ? "host" : "student";

  // Check if user already exists
  const existingUser = await User.findOne({
    $or: [{ email }, { phone }]
  });

  if (existingUser) {
    const error = new Error(
      existingUser.email === email ? "Email already registered" : "Phone already registered"
    );
    error.statusCode = 400;
    throw error;
  }

  // Associate the user with a college when their email domain matches one.
  await College.initializeDefaults();
  const college = await College.matchEmail(email);

  const user = await User.create({
    name,
    email,
    phone,
    password,
    role: safeRole,
    studentId,
    hostel,
    college: college?._id,
    collegeEmail: email,
    verificationStatus: "unverified",
    emailVerified: false
  });

  // Create the verification record and send the email verification code.
  const verification = await Verification.create({ user: user._id, collegeEmail: { email } });
  const previewOtp = await issueOtp(verification, email).catch(() => null);

  // Initialize feature flags in background
  FeatureFlag.initializeDefaults().catch(console.error);

  await AuditLog.log("user.register", "User", user._id, user._id, {
    role: safeRole,
    college: college?.name,
    hasStudentId: !!studentId
  });

  res.status(201).json({
    needsEmailVerification: true,
    email: user.email,
    emailVerificationSent: true,
    previewOtp, // null in production (only present when SMTP is not configured)
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      college: college ? { id: college._id, name: college.name } : null,
      verificationStatus: user.verificationStatus,
      emailVerified: false
    }
  });
});

// Verify the account email via the OTP issued at registration. On success the
// account is marked email-verified and a session token is returned.
export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  const user = await User.findOne({ email });
  const v = user && (await Verification.findOne({ user: user._id }));

  if (!user || !v?.collegeEmail?.otp || !v.collegeEmail.otpExpiresAt) {
    const error = new Error("Request a verification code first");
    error.statusCode = 400;
    throw error;
  }
  if (v.collegeEmail.otpExpiresAt < new Date()) {
    const error = new Error("Verification code has expired");
    error.statusCode = 400;
    throw error;
  }
  if (v.collegeEmail.otp !== String(otp)) {
    v.collegeEmail.attempts = (v.collegeEmail.attempts || 0) + 1;
    // Too many wrong guesses — burn the code so it can't be brute-forced.
    if (v.collegeEmail.attempts >= MAX_OTP_ATTEMPTS) {
      v.collegeEmail.otp = undefined;
      v.collegeEmail.otpExpiresAt = undefined;
    }
    await v.save();
    const error = new Error(
      v.collegeEmail.otp ? "Invalid verification code" : "Too many attempts. Request a new code."
    );
    error.statusCode = 400;
    throw error;
  }

  v.collegeEmail.verified = true;
  v.collegeEmail.verifiedAt = new Date();
  v.collegeEmail.otp = undefined;
  v.collegeEmail.otpExpiresAt = undefined;
  v.collegeEmail.attempts = 0;
  await v.save();

  user.emailVerified = true;
  await user.save();

  await AuditLog.log("verification.submit", "Verification", v._id, user._id, {
    step: "email_verified"
  });

  const college = user.college ? await College.findById(user.college) : null;
  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({
    message: "Email verified",
    token,
    previewOtp: undefined,
    user: publicUser(user, college)
  });
});

// Re-issue the email verification code. Always responds 200 to avoid leaking
// which emails are registered (account enumeration).
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  let previewOtp;
  if (user && !user.emailVerified) {
    const v =
      (await Verification.findOne({ user: user._id })) ||
      (await Verification.create({ user: user._id, collegeEmail: { email } }));
    previewOtp = await issueOtp(v, email).catch(() => null);
  }
  res.json({ message: "If that account exists, a verification code has been sent.", previewOtp });
});

// Login user. Order of checks: account lock → credentials → active → email
// verified (hard gate) → optional 2FA challenge → session.
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    const error = new Error("Invalid credentials");
    error.statusCode = 401;
    throw error;
  }

  // Temporary lockout after repeated failures.
  if (user.isLocked()) {
    const error = new Error(
      "Account temporarily locked due to too many failed logins. Try again later."
    );
    error.statusCode = 423;
    throw error;
  }

  if (!(await user.comparePassword(password))) {
    const lockedNow = await user.registerFailedLogin();
    const error = new Error(
      lockedNow ? "Too many failed attempts. Account locked for 15 minutes." : "Invalid credentials"
    );
    error.statusCode = lockedNow ? 423 : 401;
    throw error;
  }

  if (!user.isActive) {
    const error = new Error("Account is deactivated");
    error.statusCode = 403;
    throw error;
  }

  // Hard email gate.
  if (!user.emailVerified) {
    // Re-issue a fresh code so the user can complete verification immediately.
    const v =
      (await Verification.findOne({ user: user._id })) ||
      (await Verification.create({ user: user._id, collegeEmail: { email: user.email } }));
    const previewOtp = await issueOtp(v, user.email).catch(() => null);
    const error = new Error(
      "Please verify your email before logging in. We've sent you a new code."
    );
    error.statusCode = 403;
    error.payload = { needsEmailVerification: true, email: user.email, previewOtp };
    throw error;
  }

  // Successful password check clears the failure counter.
  await user.resetLoginAttempts();

  // Optional login 2FA — challenge with an email OTP instead of a token.
  if (user.twoFactorEnabled) {
    const previewOtp = await issueLoginOtp(user);
    return res.json({ twoFactorRequired: true, email: user.email, previewOtp });
  }

  user.lastSeen = new Date();
  await user.save();

  await AuditLog.log("user.login", "User", user._id, user._id, { role: user.role });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ token, user: publicUser(user) });
});

// Complete a 2FA login by confirming the emailed OTP.
export const verifyLoginOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.findOne({ email });

  if (!user?.otp?.code || !user.otp.expiresAt) {
    const error = new Error("Request a login code first");
    error.statusCode = 400;
    throw error;
  }
  if (user.otp.expiresAt < new Date()) {
    const error = new Error("Login code has expired");
    error.statusCode = 400;
    throw error;
  }
  if (user.otp.code !== String(otp)) {
    user.otp.attempts = (user.otp.attempts || 0) + 1;
    if (user.otp.attempts >= MAX_OTP_ATTEMPTS) user.otp = undefined;
    await user.save();
    const error = new Error("Invalid login code");
    error.statusCode = 400;
    throw error;
  }

  user.otp = undefined;
  user.lastSeen = new Date();
  await user.save();

  await AuditLog.log("user.login", "User", user._id, user._id, {
    role: user.role,
    twoFactor: true
  });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ token, user: publicUser(user) });
});

// Forgot password — email a single-use reset token. Always responds 200 to
// avoid account enumeration.
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email }).select("+password");
  let previewToken;
  if (user && user.password) {
    const { raw, hash } = generateResetToken();
    user.resetPasswordToken = hash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();
    await sendPasswordResetEmail(user.email, raw).catch((err) =>
      console.error("Reset email failed:", err.message)
    );
    await AuditLog.log("user.profile.update", "User", user._id, user._id, {
      action: "password_reset_requested"
    });
    // Dev-only convenience: echo the raw token when real mail isn't configured.
    if (!env.mailConfigured && env.nodeEnv !== "production") previewToken = raw;
  }
  res.json({
    message: "If that account exists, a password reset link has been sent.",
    previewToken
  });
});

// Reset password using the token from the email.
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password } = req.body;
  const user = await User.findOne({ email }).select(
    "+resetPasswordToken +resetPasswordExpires +password"
  );

  if (
    !user?.resetPasswordToken ||
    !user.resetPasswordExpires ||
    user.resetPasswordExpires < new Date()
  ) {
    const error = new Error("Reset link is invalid or has expired");
    error.statusCode = 400;
    throw error;
  }
  if (hashResetToken(token) !== user.resetPasswordToken) {
    const error = new Error("Reset link is invalid or has expired");
    error.statusCode = 400;
    throw error;
  }

  user.password = password; // pre-save hook hashes it
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.resetLoginAttempts();
  await user.save();

  await AuditLog.log("user.profile.update", "User", user._id, user._id, {
    action: "password_reset"
  });
  res.json({ message: "Password updated. You can now log in." });
});

// Request OTP for phone verification
export const requestOtp = asyncHandler(async (req, res) => {
  const { phone } = req.body;

  const code = String(crypto.randomInt(100000, 1000000));
  const user = await User.findOneAndUpdate(
    { phone },
    { otp: { code, expiresAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0 } },
    { new: true }
  );

  if (!user) {
    const error = new Error("Phone number not registered");
    error.statusCode = 404;
    throw error;
  }

  // Deliver the code to the account's email (SMS removed — email-only via SMTP).
  if (env.mailConfigured) {
    await sendOtpEmail(user.email, code).catch(() => {});
  }

  // Only echo the code back when email isn't configured AND we're not in
  // production — never leak OTPs to clients in a live deployment.
  const previewOtp = !env.mailConfigured && env.nodeEnv !== "production" ? code : undefined;
  res.json({ message: "Verification code sent to your registered email", previewOtp });
});

// Verify phone OTP
export const verifyOtp = asyncHandler(async (req, res) => {
  const { phone, code } = req.body;

  const user = await User.findOne({ phone });

  if (!user?.otp?.code || !user.otp.expiresAt || user.otp.expiresAt < new Date()) {
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }
  if (user.otp.code !== String(code)) {
    user.otp.attempts = (user.otp.attempts || 0) + 1;
    if (user.otp.attempts >= MAX_OTP_ATTEMPTS) user.otp = undefined;
    await user.save();
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  user.otp.verifiedAt = new Date();
  user.otp.code = undefined;
  await user.save();

  res.json({ message: "Phone verified successfully" });
});

// Get current user profile
export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  // Get verification status
  const verification = await Verification.findOne({ user: user._id });

  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      studentId: user.studentId,
      hostel: user.hostel,
      collegeEmail: user.collegeEmail,
      avatarUrl: user.avatarUrl,
      verificationStatus: user.verificationStatus,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      trustScore: user.trustScore,
      trustBreakdown: user.trustBreakdown,
      safetyScore: user.safetyScore,
      reliabilityStats: user.reliabilityStats,
      preferences: user.preferences,
      emergencyContacts: user.emergencyContacts,
      upiId: user.upiId,
      paymentMethods: user.paymentMethods,
      ratingAverage: user.ratingAverage,
      ratingCount: user.ratingCount,
      isActive: user.isActive,
      createdAt: user.createdAt
    },
    verification: verification
      ? {
          status: verification.status,
          progress: verification.progress,
          studentIdStatus: verification.studentId?.status,
          identityStatus: verification.identityProof?.status
        }
      : null
  });
});

// Toggle login 2FA for the signed-in user.
export const setTwoFactor = asyncHandler(async (req, res) => {
  const enabled = Boolean(req.body.enabled);
  await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: enabled });
  await AuditLog.log("user.profile.update", "User", req.user._id, req.user._id, {
    action: "set_2fa",
    enabled
  });
  res.json({
    message: enabled ? "Two-factor login enabled" : "Two-factor login disabled",
    twoFactorEnabled: enabled
  });
});

// Logout
export const logout = asyncHandler(async (req, res) => {
  await AuditLog.log("user.logout", "User", req.user._id, req.user._id);

  clearAuthCookie(res);
  res.json({ message: "Logged out successfully" });
});
