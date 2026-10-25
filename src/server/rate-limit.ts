import "server-only";

/**
 * Fixed-window in-memory rate limiter.
 *
 * It protects authentication and other abuse-prone endpoints in a single
 * process deployment. Multi-instance deployments should back this with a shared
 * store (Redis / Upstash) — see README "Security" section.
 */

type Bucket = {
  windowStart: number;
  count: number;
};

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  if (buckets.size > MAX_KEYS) {
    for (const [bucketKey, bucket] of buckets) {
      if (now - bucket.windowStart > windowMs) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { windowStart: now, count: 1 });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.windowStart + windowMs - now) / 1000),
    );
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Throws when the caller exceeded the allowed number of attempts. */
export function enforceRateLimit(key: string, limit: number, windowMs: number): void {
  const result = rateLimit(key, limit, windowMs);
  if (!result.ok) {
    const error = new Error("TOO_MANY_REQUESTS") as Error & { retryAfterSeconds: number };
    error.retryAfterSeconds = result.retryAfterSeconds;
    throw error;
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
