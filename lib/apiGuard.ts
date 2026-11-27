import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createRateLimiter } from "@/lib/rateLimit";

// Guards for the /api/* TMDB proxies (security audit F1). middleware.ts skips /api,
// so each route handler opts in here.

/**
 * Returns a 401 response when there is no signed-in user, or null when the caller
 * may continue: `const denied = await requireSession(); if (denied) return denied;`
 */
export async function requireSession(): Promise<Response | null> {
  const session = await auth();
  if (session?.user?.id) return null;
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * The caller's IP. On Vercel, `x-forwarded-for` is set by the platform and its first
 * entry is the client, so a client can't spoof it there. Locally it may be absent.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

// One budget shared by every public TMDB proxy, so a script can't spread its calls
// across routes. 120 per minute per IP (per server instance, see lib/rateLimit.ts) is
// far above what a person opening trailers and detail modals sends, and caps a loop
// at about 2 TMDB calls a second per instance.
export const PUBLIC_LIMIT = { limit: 120, windowMs: 60 * 1000 };
const allowPublic = createRateLimiter(PUBLIC_LIMIT);

/** Returns a 429 response once this IP is over the public budget, otherwise null. */
export function limitByIp(req: Request, allow: (key: string) => boolean = allowPublic): Response | null {
  if (allow(clientIp(req))) return null;
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(PUBLIC_LIMIT.windowMs / 1000) } }
  );
}
