import { parseCspReports } from "@/lib/cspReport";
import { createRateLimiter } from "@/lib/rateLimit";

// Browsers POST Content-Security-Policy violations here (report-uri / report-to in
// lib/securityHeaders.ts). Each one is logged as a single "[csp-violation]" line, so
// the owner can read them in Vercel's runtime logs (filter on "csp-violation").
// No sign-in: browsers send reports for signed-out pages too. The body is untrusted.

/** Real reports are a few hundred bytes; anything far bigger is ignored. */
const MAX_BODY_BYTES = 16 * 1024;

// 30 reports per client per minute (per server instance; see lib/rateLimit.ts),
// so one page in a violation loop, or a script, can't flood the logs.
const allowReport = createRateLimiter({ limit: 30, windowMs: 60 * 1000 });

const ACCEPTED_TYPES = ["application/csp-report", "application/reports+json", "application/json"];

// Always 204: the browser does nothing with the answer, and a uniform reply tells a
// prober nothing.
const noContent = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_TYPES.includes(type)) return noContent();
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return noContent();

  const client = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!allowReport(client)) return noContent();

  const text = await req.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return noContent();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return noContent();
  }

  for (const violation of parseCspReports(body)) {
    console.warn("[csp-violation]", JSON.stringify(violation));
  }
  return noContent();
}
