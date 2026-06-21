import dotenv from "dotenv";

dotenv.config();

const isProduction = (process.env.NODE_ENV || "development") === "production";

// Insecure development-only JWT secret. NEVER used in production: the fallback
// is withheld when NODE_ENV=production (see below) and assertRequiredSecrets()
// hard-fails boot if a real JWT_SECRET is still missing.
const DEV_JWT_SECRET = "dev-secret-change-me";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/uber_clone",
  // In production there is no fallback — a missing JWT_SECRET leaves this empty
  // and assertRequiredSecrets() throws before the server accepts traffic.
  jwtSecret: process.env.JWT_SECRET || (isProduction ? "" : DEV_JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // Cookie SameSite policy for the auth cookie. "lax"/"strict" suit same-site
  // (frontend + API share a registrable domain); "none" requires HTTPS and is
  // for cross-site deploys (and should be paired with CSRF tokens).
  cookieSameSite: process.env.COOKIE_SAMESITE || "lax",
  shareTokenExpiresIn: process.env.SHARE_TOKEN_EXPIRES_IN || "12h",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  appName: process.env.APP_NAME || "CampusPool",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "CampusPool <no-reply@campuspool.app>",
  get mailConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  },
  // Inbox that receives support tickets, feedback and bug reports.
  supportEmail: process.env.SUPPORT_EMAIL || "adityamishrav820@gmail.com",
  // Google OAuth (optional). The "Continue with Google" flow is only wired when
  // both client id and secret are present, so dev/tests are unaffected.
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback",
  get googleOAuthConfigured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || "",
  // Twilio SMS (optional) — SOS / safety alerts to emergency contacts.
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
  get smsConfigured() {
    return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
  },
  // Safe-arrival escalation: grace period (minutes) after expected arrival, and
  // how often the scheduler runs (seconds).
  arrivalGraceMinutes: Number(process.env.ARRIVAL_GRACE_MINUTES || 15),
  arrivalScanIntervalSeconds: Number(process.env.ARRIVAL_SCAN_INTERVAL_SECONDS || 60),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  rateLimitRedisPrefix: process.env.RATE_LIMIT_REDIS_PREFIX || "uberclone:ratelimit",
  // Max auth/OTP requests per IP per 15-min window (credential-stuffing guard).
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT || 40),
  // Tighter per-IP caps layered on top of the per-account lockout & per-code
  // attempt caps (defense in depth against brute force).
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  passwordResetRateLimit: Number(process.env.PASSWORD_RESET_RATE_LIMIT || 5),
  otpVerifyRateLimit: Number(process.env.OTP_VERIFY_RATE_LIMIT || 10),
  otpRequestRateLimit: Number(process.env.OTP_REQUEST_RATE_LIMIT || 5),
  baseFare: Number(process.env.BASE_FARE || 45),
  perKmRate: Number(process.env.PER_KM_RATE || 18),
  perMinRate: Number(process.env.PER_MIN_RATE || 2.5),
  surgeMultiplier: Number(process.env.SURGE_MULTIPLIER || 1.2),
  driverRejectTimeoutSeconds: Number(process.env.DRIVER_REJECT_TIMEOUT_SECONDS || 25)
};

/**
 * Fail fast at boot when running in production without the secrets required to
 * sign/verify auth tokens securely. A misconfigured prod deploy must crash on
 * startup rather than silently fall back to a guessable JWT secret (which would
 * allow token forgery). Dev/test are unaffected.
 */
export function assertRequiredSecrets() {
  if (env.nodeEnv !== "production") return;

  const problems = [];
  if (!env.jwtSecret || env.jwtSecret === DEV_JWT_SECRET) {
    problems.push("JWT_SECRET is required in production and must not be the dev default.");
  } else if (env.jwtSecret.length < 32) {
    problems.push("JWT_SECRET should be at least 32 characters of high-entropy randomness.");
  }

  if (problems.length) {
    throw new Error(
      `Refusing to start: insecure production configuration:\n  - ${problems.join("\n  - ")}`
    );
  }
}
