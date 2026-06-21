import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Single-use password-reset token. We hand the raw token to the user (via email)
// and persist only its SHA-256 hash, so a leaked DB row can't be used to reset.
export function generateResetToken() {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = hashResetToken(raw);
  return { raw, hash };
}

export function hashResetToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

export function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

// Signed, expiring token for an external read-only trip-share link. The link
// holder can view live trip status without an account, so it carries no auth
// identity — only the trip id and a fixed `kind` to prevent token reuse.
export function signShareToken(tripId) {
  return jwt.sign(
    { tripId: String(tripId), kind: "trip_share" },
    env.jwtSecret,
    { expiresIn: env.shareTokenExpiresIn }
  );
}

export function verifyShareToken(token) {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (decoded.kind !== "trip_share" || !decoded.tripId) {
    const error = new Error("Not a valid share token");
    error.statusCode = 400;
    throw error;
  }
  return decoded;
}
