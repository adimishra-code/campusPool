import Redis from "ioredis";
import { env } from "./env.js";

let client = null;
let initialized = false;

/**
 * Shared Redis client.
 * Redis-backed rate limiting is temporarily disabled for local development.
 */
export function getRedisClient() {
  if (initialized) return client;
  initialized = true;

  if (env.nodeEnv === "test" || !process.env.REDIS_URL) {
    client = null;
    return client;
  }

  try {
    client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false
    });

    client.on("error", (err) => {
      console.error("[redis] error:", err.message);
    });

    client.on("connect", () => {
      console.log("[redis] connected");
    });
  } catch (err) {
    console.error("[redis] init failed:", err.message);
    client = null;
  }

  return client;
}

/**
 * Local development fallback.
 * Returning undefined makes express-rate-limit use its default
 * in-memory store instead of Redis.
 */
export function makeRateLimitStore() {
  return undefined;
}