import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { env } from "../config/env.js";
import { AUTH_COOKIE } from "../utils/cookies.js";

// Retrieves token from httpOnly cookie or Authorization header.
function getToken(req) {
  if (req.cookies?.[AUTH_COOKIE]) return req.cookies[AUTH_COOKIE];
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

export async function protect(req, _res, next) {
  try {
    const token = getToken(req);
    if (!token) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      throw error;
    }

    const decoded = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(decoded.id).select("-password");
    if (!user || !user.isActive) {
      const error = new Error("Invalid or inactive account");
      error.statusCode = 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (error) {
    error.statusCode = error.statusCode || 401;
    next(error);
  }
}

// Attaches req.user if a valid token is present; otherwise silently continues.
export async function optionalAuth(req, _res, next) {
  try {
    const token = getToken(req);
    if (token) {
      const decoded = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(decoded.id).select("-password");
      if (user && user.isActive) req.user = user;
    }
  } catch {
    // ignore — treat as anonymous
  }
  next();
}

export function authorize(...roles) {
  return (req, _res, next) => {
    if (!roles.includes(req.user.role)) {
      const error = new Error("Forbidden");
      error.statusCode = 403;
      return next(error);
    }
    next();
  };
}
