import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the root .env relative to this file instead of process.cwd(),
// ensuring environment variables load correctly regardless of launch context.
// Under test conditions, we skip loading the developer's local .env to run on defaults.
if (process.env.NODE_ENV !== "test") {
  const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
  dotenv.config({ path: rootEnv });
  // Support a cwd-local .env file as a fallback. Process environment variables take precedence.
  dotenv.config();
}

const isProduction = (process.env.NODE_ENV || "development") === "production";

// Insecure fallback secret for development only. Production rejects this fallback.
const DEV_JWT_SECRET = "dev-secret-change-me";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/campuspool",
  // No fallback in production — missing JWT_SECRET prevents startup.
  jwtSecret: process.env.JWT_SECRET || (isProduction ? "" : DEV_JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  // SameSite cookie policy for authentication.
  cookieSameSite: process.env.COOKIE_SAMESITE || "lax",
  shareTokenExpiresIn: process.env.SHARE_TOKEN_EXPIRES_IN || "12h",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  appName: process.env.APP_NAME || "CampusPool",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendFrom: process.env.RESEND_FROM || "",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  smtpFrom: process.env.SMTP_FROM || "CampusPool <no-reply@campuspool.app>",
  get mailConfigured() {
    return Boolean(
      process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
    );
  },
  supportEmail: process.env.SUPPORT_EMAIL || "adityamishrav820@gmail.com",
  // Google OAuth (optional). Enabled only when client ID and secret are provided.
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback",
  get googleOAuthConfigured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
  // Twilio SMS configuration for emergency safety alerts.
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER || "",
  get smsConfigured() {
    return Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_FROM_NUMBER
    );
  },
  // Arrival escalation thresholds: grace period in minutes, check interval in seconds.
  arrivalGraceMinutes: Number(process.env.ARRIVAL_GRACE_MINUTES || 15),
  arrivalScanIntervalSeconds: Number(process.env.ARRIVAL_SCAN_INTERVAL_SECONDS || 60),
  redisUrl: process.env.REDIS_URL || "",
  rateLimitRedisPrefix: process.env.RATE_LIMIT_REDIS_PREFIX || "campuspool:ratelimit",
  // Global auth rate limit (requests per IP per 15 min).
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT || 40),
  // Granular brute-force caps (requests per IP).
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  passwordResetRateLimit: Number(process.env.PASSWORD_RESET_RATE_LIMIT || 5),
  otpVerifyRateLimit: Number(process.env.OTP_VERIFY_RATE_LIMIT || 10),
  otpRequestRateLimit: Number(process.env.OTP_REQUEST_RATE_LIMIT || 5)
};

/**
 * Ensures required secrets are present and valid when running in production.
 * Crashes early to prevent misconfigured production deployments.
 */
export function assertRequiredSecrets() {
  if (env.nodeEnv !== "production") return;

  const problems = [];
  if (!env.jwtSecret || env.jwtSecret === DEV_JWT_SECRET) {
    problems.push("JWT_SECRET is required in production and must not be the dev default.");
  } else if (env.jwtSecret.length < 32) {
    problems.push("JWT_SECRET should be at least 32 characters of high-entropy randomness.");
  }

  // SameSite is the primary CSRF defense. sameSite=none is rejected because the
  // application is designed for same-site deployments and does not issue CSRF tokens.
  if (env.cookieSameSite === "none") {
    problems.push(
      "COOKIE_SAMESITE=none is not supported: this app relies on SameSite for CSRF protection " +
        "and ships no CSRF tokens. Deploy the SPA and API same-site and use COOKIE_SAMESITE=lax."
    );
  }

  if (problems.length) {
    throw new Error(
      `Refusing to start: insecure production configuration:\n  - ${problems.join("\n  - ")}`
    );
  }
}
