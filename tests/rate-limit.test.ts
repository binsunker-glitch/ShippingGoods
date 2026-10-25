import { beforeEach, describe, expect, it } from "vitest";

import { enforceRateLimit, rateLimit, resetRateLimits } from "@/server/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit and blocks the next attempt", () => {
    const now = 1_000_000;
    expect(rateLimit("login:alice", 3, 60_000, now).ok).toBe(true);
    expect(rateLimit("login:alice", 3, 60_000, now).ok).toBe(true);
    const third = rateLimit("login:alice", 3, 60_000, now);
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = rateLimit("login:alice", 3, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps keys independent", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i += 1) rateLimit("login:alice", 2, 60_000, now);
    expect(rateLimit("login:alice", 2, 60_000, now).ok).toBe(false);
    expect(rateLimit("login:bob", 2, 60_000, now).ok).toBe(true);
  });

  it("resets the window once it elapses", () => {
    const start = 1_000_000;
    rateLimit("track:1.2.3.4", 1, 60_000, start);
    expect(rateLimit("track:1.2.3.4", 1, 60_000, start).ok).toBe(false);
    // One millisecond past the window starts a fresh bucket.
    expect(rateLimit("track:1.2.3.4", 1, 60_000, start + 60_001).ok).toBe(true);
  });

  it("reports a positive retry-after window when blocked", () => {
    const now = 1_000_000;
    rateLimit("k", 1, 30_000, now);
    const blocked = rateLimit("k", 1, 30_000, now + 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(20);
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("returns silently while under the limit", () => {
    expect(() => enforceRateLimit("reset:user", 2, 60_000)).not.toThrow();
    expect(() => enforceRateLimit("reset:user", 2, 60_000)).not.toThrow();
  });

  it("throws a TOO_MANY_REQUESTS error carrying retryAfterSeconds", () => {
    enforceRateLimit("reset:user", 1, 60_000);
    try {
      enforceRateLimit("reset:user", 1, 60_000);
      throw new Error("expected enforceRateLimit to throw");
    } catch (error) {
      const typed = error as Error & { retryAfterSeconds?: number };
      expect(typed.message).toBe("TOO_MANY_REQUESTS");
      expect(typed.retryAfterSeconds).toBeGreaterThan(0);
    }
  });
});
