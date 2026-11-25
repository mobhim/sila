import { db } from "../db";

/**
 * Fixed-window rate limiter stored in Postgres so it holds across server instances.
 * Returns true when the call is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, NOW() + make_interval(secs => ${windowSec}::int))
    ON CONFLICT (key) DO UPDATE SET
      count    = CASE WHEN rate_limits.reset_at < NOW() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE WHEN rate_limits.reset_at < NOW() THEN NOW() + make_interval(secs => ${windowSec}::int) ELSE rate_limits.reset_at END
    RETURNING count`;
  return (rows[0]?.count ?? 1) <= limit;
}

export async function clearRateLimit(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}
