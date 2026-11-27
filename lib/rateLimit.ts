/**
 * Sliding-window rate limiter kept in memory. `check(key)` records a hit and
 * returns false once `key` has made `limit` hits within the last `windowMs`.
 *
 * Memory is per server instance: on Vercel (Fluid Compute) one instance serves
 * many requests, so this stops a single client's loop, but separate instances keep
 * separate counts. It is a cheap first line, not a global quota.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("limit must be a positive integer");
  const hits = new Map<string, number[]>();
  let lastSweep = now();

  return function check(key: string): boolean {
    const t = now();
    const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    // Once per window, drop idle keys so the map can't grow without bound.
    if (t - lastSweep >= windowMs) {
      lastSweep = t;
      for (const [k, v] of hits) if (v.every((at) => t - at >= windowMs)) hits.delete(k);
    }
    return true;
  };
}
