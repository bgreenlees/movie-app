import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CSP_REPORT_PATH,
  ENFORCE_CSP_IN_PRODUCTION,
  contentSecurityPolicy,
  cspHeaderName,
  cspMode,
  generateNonce,
  securityHeaders,
} from "./securityHeaders";
import { THEME_SCRIPT, themeScriptHashSource } from "./themeScript";

const header = (key: string) => securityHeaders().find((h) => h.key === key)?.value;

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("securityHeaders", () => {
  it("blocks framing two ways, on every route", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("leaves the full page CSP to middleware (it needs a per-request nonce)", () => {
    expect(header("Content-Security-Policy-Report-Only")).toBeUndefined();
    expect(header("Content-Security-Policy")).not.toContain("script-src");
  });

  it("sets the basic hardening headers", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
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

describe("cspHeaderName", () => {
  it("enforces or only reports, by mode", () => {
    expect(cspHeaderName("enforce")).toBe("Content-Security-Policy");
    expect(cspHeaderName("report-only")).toBe("Content-Security-Policy-Report-Only");
  });
});

describe("generateNonce", () => {
  it("is base64 and different every time", () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a.length).toBeGreaterThanOrEqual(24);
    expect(generateNonce()).not.toBe(a);
  });
});

describe("themeScriptHashSource", () => {
  it("is the SHA-256 of the exact theme script text", async () => {
    const expected = createHash("sha256").update(THEME_SCRIPT, "utf8").digest("base64");
    expect(await themeScriptHashSource()).toBe(`'sha256-${expected}'`);
  });
});

describe("contentSecurityPolicy", () => {
  const nonce = "dGVzdC1ub25jZQ==";
  const csp = contentSecurityPolicy({ nonce, isDev: false });

  it("allows scripts only by nonce (plus what they load), never inline", () => {
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("https://vercel.live");
  });

  it("allows the theme script by its hash", async () => {
    const hash = await themeScriptHashSource();
    const withTheme = contentSecurityPolicy({ nonce, scriptHashes: [hash], isDev: false });
    expect(directive(withTheme, "script-src")).toContain(hash);
  });

  it("keeps the nonce out of style-src, where it would disable 'unsafe-inline'", () => {
    expect(directive(csp, "style-src")).toContain("'unsafe-inline'");
    expect(directive(csp, "style-src").join(" ")).not.toContain("nonce-");
  });

  it("allows YouTube trailers and TMDB / news images", () => {
    expect(directive(csp, "frame-src")).toContain("https://www.youtube.com");
    expect(directive(csp, "img-src")).toEqual(expect.arrayContaining(["'self'", "https:"]));
  });

  it("allows the Vercel Toolbar outside script-src", () => {
    for (const name of ["style-src", "font-src", "connect-src", "frame-src"]) {
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
    const dev = contentSecurityPolicy({ nonce, isDev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });
});
