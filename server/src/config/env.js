import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// dotenv reads ./.env relative to process.cwd(), but the server is commonly
// started with cwd=server/ (e.g. `npm run dev --prefix server`), where no .env
// exists — so the repo-root .env was silently ignored and every var fell back
// to its code default. Resolve the root .env by this module's location instead,
// so config loads no matter where the process is launched from.
// Don't load developer .env files under test: the suite must run on clean code
// defaults (dev previewOtp flow, test JWT secret, mail NOT configured) regardless
// of whatever real SMTP/secrets the developer has in their local .env.
if (process.env.NODE_ENV !== "test") {
  const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.env");
  dotenv.config({ path: rootEnv });
  // Also honour a cwd-local .env (e.g. a custom server/.env) without overriding
  // anything already loaded above. In containers, real env vars take precedence.
  dotenv.config();
}

const isProduction = (process.env.NODE_ENV || "development") === "production";

// Insecure development-only JWT secret. NEVER used in production: the fallback
// is withheld when NODE_ENV=production (see below) and assertRequiredSecrets()
// hard-fails boot if a real JWT_SECRET is still missing.
const DEV_JWT_SECRET = "dev-secret-change-me";

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  mongoUri: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/campuspool",
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
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback",
  get googleOAuthConfigured() {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  },
  // Safe-arrival escalation: grace period (minutes) after expected arrival, and
  // how often the scheduler runs (seconds).
  arrivalGraceMinutes: Number(process.env.ARRIVAL_GRACE_MINUTES || 15),
  arrivalScanIntervalSeconds: Number(process.env.ARRIVAL_SCAN_INTERVAL_SECONDS || 60),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  rateLimitRedisPrefix: process.env.RATE_LIMIT_REDIS_PREFIX || "campuspool:ratelimit",
  // Max auth/OTP requests per IP per 15-min window (credential-stuffing guard).
  authRateLimit: Number(process.env.AUTH_RATE_LIMIT || 40),
  // Tighter per-IP caps layered on top of the per-account lockout & per-code
  // attempt caps (defense in depth against brute force).
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT || 10),
  passwordResetRateLimit: Number(process.env.PASSWORD_RESET_RATE_LIMIT || 5),
  otpVerifyRateLimit: Number(process.env.OTP_VERIFY_RATE_LIMIT || 10),
  otpRequestRateLimit: Number(process.env.OTP_REQUEST_RATE_LIMIT || 5)
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

  // The auth cookie's CSRF defense is SameSite. SameSite=none disables that
  // protection and is only safe when paired with CSRF tokens — which this app
  // deliberately does not ship (it is designed for a same-site deploy). Refuse
  // to boot in that combination rather than run cross-site without CSRF cover.
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
