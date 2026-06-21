import Redis from "ioredis";
import { RedisStore } from "rate-limit-redis";
import { env } from "./env.js";

let client = null;
let initialized = false;

/**
 * Shared ioredis client used to back rate limiting across processes/replicas.
 *
 * Only created when REDIS_URL is explicitly set (so plain local dev doesn't spam
 * connection errors against a non-existent localhost Redis) and we're not under
 * test. Connection failures are non-fatal — callers fall back to the in-memory
 * store, so the API keeps serving (limits just aren't shared across replicas).
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
    client.on("error", (err) => console.error("[redis] error:", err.message));
    client.on("connect", () => console.log("[redis] connected — rate limiting is now distributed"));
  } catch (err) {
    console.error("[redis] init failed, using in-memory rate limiting:", err.message);
    client = null;
  }
  return client;
}

/**
 * Build a RedisStore for express-rate-limit, namespaced per limiter so each
 * bucket counts independently. Returns undefined when Redis isn't available,
 * which makes express-rate-limit transparently use its default memory store.
 */
export function makeRateLimitStore(suffix) {
  const redis = getRedisClient();
  if (!redis) return undefined;
  return new RedisStore({
    sendCommand: (...args) => redis.call(...args),
    prefix: `${env.rateLimitRedisPrefix}:${suffix}:`
  });
}
