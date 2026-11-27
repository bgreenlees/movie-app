import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./securityHeaders";

const header = (key: string, isDev = false) =>
  securityHeaders(isDev).find((h) => h.key === key)?.value;

const directive = (csp: string, name: string) =>
  csp.split("; ").find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];

describe("securityHeaders", () => {
  it("blocks framing two ways", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
    expect(header("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("sets the basic hardening headers", () => {
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("sends the full CSP as report-only", () => {
    expect(header("Content-Security-Policy-Report-Only")).toBe(contentSecurityPolicy(false));
  });
});

describe("contentSecurityPolicy", () => {
  const csp = contentSecurityPolicy(false);

  it("allows YouTube trailers and TMDB / news images", () => {
    expect(directive(csp, "frame-src")).toContain("https://www.youtube.com");
    expect(directive(csp, "img-src")).toEqual(expect.arrayContaining(["'self'", "https:"]));
  });

  it("forbids plugins, base-tag hijacks and framing", () => {
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "base-uri")).toEqual(["'self'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
  });

  it("allows eval and websockets only in dev", () => {
    expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(csp, "connect-src")).not.toContain("ws:");
    const dev = contentSecurityPolicy(true);
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
  });
});
