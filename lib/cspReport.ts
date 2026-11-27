// Parses CSP violation reports sent to /api/csp-report. Browsers send two shapes:
// - report-uri (Firefox, Safari): Content-Type application/csp-report,
//   body { "csp-report": { "document-uri", "blocked-uri", "effective-directive", … } }
// - report-to / Reporting API (Chromium): Content-Type application/reports+json,
//   body [{ type: "csp-violation", url, body: { documentURL, blockedURL, effectiveDirective, … } }]
// The body is untrusted (anyone can POST), so only a few known fields are kept,
// strings are capped, and URLs lose their query and fragment, which could carry
// tokens or personal data, before anything is logged.

export type CspViolation = {
  documentUrl: string | null;
  blockedUrl: string | null;
  directive: string | null;
  disposition: string | null;
  sourceFile: string | null;
  line: number | null;
};

/** The most reports one request may carry; the rest are ignored. */
export const MAX_REPORTS_PER_REQUEST = 10;
const MAX_STRING = 200;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v.slice(0, MAX_STRING) : null;
}

/** Keeps origin + path of a URL; keywords like "inline" or "eval" pass through. */
export function redactUrl(v: unknown): string | null {
  if (typeof v !== "string" || v === "") return null;
  try {
    const u = new URL(v);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "wss:" || u.protocol === "ws:") {
      return `${u.origin}${u.pathname}`.slice(0, MAX_STRING);
    }
    return u.protocol; // data:, blob:, chrome-extension:, … — the scheme is enough.
  } catch {
    return /^[a-z-]+$/i.test(v) ? v.slice(0, 40) : null;
  }
}

function line(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

function fromLegacy(r: Obj): CspViolation {
  return {
    documentUrl: redactUrl(r["document-uri"]),
    blockedUrl: redactUrl(r["blocked-uri"]),
    directive: str(r["effective-directive"]) ?? str(r["violated-directive"]),
    disposition: str(r["disposition"]),
    sourceFile: redactUrl(r["source-file"]),
    line: line(r["line-number"]),
  };
}

function fromReportingApi(b: Obj): CspViolation {
  return {
    documentUrl: redactUrl(b.documentURL),
    blockedUrl: redactUrl(b.blockedURL),
    directive: str(b.effectiveDirective),
    disposition: str(b.disposition),
    sourceFile: redactUrl(b.sourceFile),
    line: line(b.lineNumber),
  };
}

/** Returns the violations in a report body (already JSON-parsed); [] for anything else. */
export function parseCspReports(body: unknown): CspViolation[] {
  if (isObj(body) && isObj(body["csp-report"])) return [fromLegacy(body["csp-report"])];
  if (!Array.isArray(body)) return [];
  return body
    .slice(0, MAX_REPORTS_PER_REQUEST)
    .filter((r): r is Obj => isObj(r) && r.type === "csp-violation" && isObj(r.body))
    .map((r) => fromReportingApi(r.body as Obj));
}
