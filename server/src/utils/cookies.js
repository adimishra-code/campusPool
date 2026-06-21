import { env } from "../config/env.js";

// Name of the httpOnly cookie that carries the JWT session for browser clients.
export const AUTH_COOKIE = "token";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Shared cookie attributes. `httpOnly` keeps the token out of reach of any
// injected JavaScript (XSS can't read or exfiltrate it); `sameSite` blocks the
// browser from attaching it to cross-site requests (CSRF defense). `secure` is
// enforced in production so the cookie is only ever sent over HTTPS.
function baseOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: env.cookieSameSite,
    path: "/"
  };
}

// Persist the signed JWT as an httpOnly cookie. The browser then sends it
// automatically (with `withCredentials`) so the SPA never has to store the
// token in JS-readable storage.
export function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, { ...baseOptions(), maxAge: SEVEN_DAYS_MS });
}

// Clear the auth cookie on logout. Attributes must match those used to set it
// (minus maxAge) for the browser to remove it reliably.
export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, baseOptions());
}
