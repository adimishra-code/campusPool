import Redis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import { env } from "./env.js";

let client = null;
let initialized = false;

/**
 * Shared Redis client.
 */
export function getRedisClient() {
  if (initialized) return client;
  initialized = true;

  if (env.nodeEnv === "test" || !env.redisUrl) {
    client = null;
    return client;
  }

  try {
    client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: env.nodeEnv === "production" ? 20 : 1,
      enableOfflineQueue: env.nodeEnv === "production",
      retryStrategy: (times) => {
        if (env.nodeEnv !== "production" && times > 1) return null;
        return Math.min(times * 100, 3000);
      }
    });

    client.on("error", (err) => {
      if (env.nodeEnv === "production") {
        console.error("[redis] error:", err.message);
      }
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
 * Creates a rate limit store. In production, RedisStore is used when Redis
 * is configured so rate limits are shared across replicas. In dev or test
 * (or if Redis is not reachable), falls back gracefully to in-memory limiting.
 */
export function makeRateLimitStore(suffix = "global") {
  if (env.nodeEnv === "test") return undefined;

  const redis = getRedisClient();
  if (!redis) return undefined;

  // In non-production, fall back to in-memory if Redis is not running/ready
  if (env.nodeEnv !== "production" && redis.status !== "ready") {
    return undefined;
  }

  try {
    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `${env.rateLimitRedisPrefix}:${suffix}:`
    });
  } catch (err) {
    console.error(`[redis] rate-limit store init failed for ${suffix}:`, err.message);
    return undefined;
  }
}
