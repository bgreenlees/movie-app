import { describe, expect, it } from "vitest";
import { MAX_REPORTS_PER_REQUEST, parseCspReports, redactUrl } from "./cspReport";

describe("redactUrl", () => {
  it("drops query strings and fragments", () => {
    expect(redactUrl("https://whatsupnext.site/login?token=secret#x")).toBe("https://whatsupnext.site/login");
  });

  it("reduces non-web schemes to the scheme", () => {
    expect(redactUrl("data:image/png;base64,AAAA")).toBe("data:");
    expect(redactUrl("chrome-extension://abc/x.js")).toBe("chrome-extension:");
  });

  it("keeps CSP keywords and drops junk", () => {
    expect(redactUrl("inline")).toBe("inline");
    expect(redactUrl("eval")).toBe("eval");
    expect(redactUrl("not a url ?q=1")).toBeNull();
    expect(redactUrl(42)).toBeNull();
  });
});

describe("parseCspReports", () => {
  it("reads a report-uri (application/csp-report) body", () => {
    const out = parseCspReports({
      "csp-report": {
        "document-uri": "https://whatsupnext.site/search?q=dune",
        "blocked-uri": "https://evil.example/x.js?id=1",
        "violated-directive": "script-src-elem",
        disposition: "enforce",
        "line-number": 12,
      },
    });
    expect(out).toEqual([
      {
        documentUrl: "https://whatsupnext.site/search",
        blockedUrl: "https://evil.example/x.js",
        directive: "script-src-elem",
        disposition: "enforce",
        sourceFile: null,
        line: 12,
      },
    ]);
  });

  it("reads Reporting API (application/reports+json) bodies and skips other types", () => {
    const out = parseCspReports([
      { type: "deprecation", body: { message: "x" } },
      {
        type: "csp-violation",
        url: "https://whatsupnext.site/",
        body: {
          documentURL: "https://whatsupnext.site/movie/1?ref=a",
          blockedURL: "inline",
          effectiveDirective: "style-src-attr",
          disposition: "report",
          sourceFile: "https://whatsupnext.site/_next/static/chunks/a.js",
          lineNumber: "7",
        },
      },
    ]);
    expect(out).toEqual([
      {
        documentUrl: "https://whatsupnext.site/movie/1",
        blockedUrl: "inline",
        directive: "style-src-attr",
        disposition: "report",
        sourceFile: "https://whatsupnext.site/_next/static/chunks/a.js",
        line: null,
      },
    ]);
  });

  it("caps reports per request and string length", () => {
    const one = { type: "csp-violation", body: { effectiveDirective: "x".repeat(1000) } };
    const out = parseCspReports(Array(50).fill(one));
    expect(out).toHaveLength(MAX_REPORTS_PER_REQUEST);
    expect(out[0].directive).toHaveLength(200);
  });

  it("ignores bodies that aren't reports", () => {
    for (const body of [null, "x", 1, {}, { "csp-report": "x" }, [1, null, { type: "csp-violation" }]]) {
      expect(parseCspReports(body)).toEqual([]);
    }
  });
});
