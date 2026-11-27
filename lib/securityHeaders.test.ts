import { describe, expect, it } from "vitest";
import {
  CSP_REPORT_PATH,
  ENFORCE_CSP_IN_PRODUCTION,
  contentSecurityPolicy,
  cspMode,
  securityHeaders,
} from "./securityHeaders";

const header = (key: string, mode: "enforce" | "report-only" = "enforce", isDev = false) =>
  securityHeaders(isDev, mode).find((h) => h.key === key)?.value;

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("securityHeaders", () => {
  it("blocks framing two ways in either mode", () => {
    for (const mode of ["enforce", "report-only"] as const) {
      expect(header("X-Frame-Options", mode)).toBe("DENY");
      expect(directive(header("Content-Security-Policy", mode)!, "frame-ancestors")).toEqual(["'none'"]);
    }
  });

  it("sets the basic hardening headers", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("enforces the full CSP in enforce mode", () => {
    expect(header("Content-Security-Policy")).toBe(contentSecurityPolicy(false));
    expect(header("Content-Security-Policy-Report-Only")).toBeUndefined();
  });

  it("sends the full CSP as report-only in report-only mode", () => {
    expect(header("Content-Security-Policy", "report-only")).toBe("frame-ancestors 'none'");
    expect(header("Content-Security-Policy-Report-Only", "report-only")).toBe(contentSecurityPolicy(false));
  });

  it("names the report endpoint for the Reporting API", () => {
    expect(header("Reporting-Endpoints")).toBe(`csp-endpoint="${CSP_REPORT_PATH}"`);
  });
});

describe("cspMode", () => {
  it("enforces in local dev and on previews", () => {
    expect(cspMode("development", undefined)).toBe("enforce");
    expect(cspMode("production", "preview")).toBe("enforce");
    expect(cspMode("production", "development")).toBe("enforce");
  });

  it("keeps production (or an unknown build) report-only until the flag flips", () => {
    const expected = ENFORCE_CSP_IN_PRODUCTION ? "enforce" : "report-only";
    expect(cspMode("production", "production")).toBe(expected);
    expect(cspMode("production", undefined)).toBe(expected);
  });
});

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy(false);

  it("allows YouTube trailers and TMDB / news images", () => {
    expect(directive(csp, "frame-src")).toContain("https://www.youtube.com");
    expect(directive(csp, "img-src")).toEqual(expect.arrayContaining(["'self'", "https:"]));
  });

  it("allows the Vercel Toolbar", () => {
    for (const name of ["script-src", "style-src", "font-src", "connect-src", "frame-src"]) {
      expect(directive(csp, name)).toContain("https://vercel.live");
    }
    expect(directive(csp, "font-src")).toContain("https://assets.vercel.com");
  });

  it("forbids plugins, base-tag hijacks and framing", () => {
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("reports violations to /api/csp-report", () => {
    expect(directive(csp, "report-uri")).toEqual([CSP_REPORT_PATH]);
    expect(directive(csp, "report-to")).toEqual(["csp-endpoint"]);
  });

  it("allows eval and websockets only in dev", () => {
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).not.toContain("ws:");
    const dev = contentSecurityPolicy(true);
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });
});
