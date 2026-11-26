import { describe, expect, it } from "vitest";
import {
  DEV_LOGIN_PROVIDER_ID,
  authorizeDevLogin,
  devLoginProviders,
  isDevLoginEnabled,
  parseDevLoginEmail,
} from "./devLogin";

const DEV = { NODE_ENV: "development", DEV_LOGIN: "1" };

describe("isDevLoginEnabled", () => {
  it("is enabled only outside production with DEV_LOGIN=1", () => {
    expect(isDevLoginEnabled(DEV)).toBe(true);
    expect(isDevLoginEnabled({ NODE_ENV: "test", DEV_LOGIN: "1" })).toBe(true);
  });

  it("is disabled when NODE_ENV=production, even with DEV_LOGIN=1", () => {
    expect(isDevLoginEnabled({ NODE_ENV: "production", DEV_LOGIN: "1" })).toBe(false);
  });

  it("is disabled when DEV_LOGIN is unset or anything other than '1'", () => {
    for (const DEV_LOGIN of [undefined, "", "0", "true", "yes", " 1", "1 "]) {
      expect(isDevLoginEnabled({ NODE_ENV: "development", DEV_LOGIN })).toBe(false);
    }
  });
});

describe("devLoginProviders", () => {
  it("returns no provider when NODE_ENV=production", () => {
    expect(devLoginProviders({ NODE_ENV: "production", DEV_LOGIN: "1" })).toEqual([]);
  });

  it("returns no provider when DEV_LOGIN is unset", () => {
    expect(devLoginProviders({ NODE_ENV: "development" })).toEqual([]);
  });

  it("returns exactly one credentials provider when enabled", () => {
    const providers = devLoginProviders(DEV);
    expect(providers).toHaveLength(1);
    // Auth.js merges the user's options over the defaults (lib/utils/providers.js).
    const p = providers[0] as { id: string; type: string; options?: { id?: string } };
    expect(p.options?.id ?? p.id).toBe(DEV_LOGIN_PROVIDER_ID);
    expect(p.type).toBe("credentials");
  });
});

describe("parseDevLoginEmail", () => {
  it("accepts @example.test addresses and normalises case and whitespace", () => {
    expect(parseDevLoginEmail("tester@example.test")).toBe("tester@example.test");
    expect(parseDevLoginEmail("  Tester+2@Example.TEST ")).toBe("tester+2@example.test");
  });

  it.each([
    "tester@gmail.com",
    "tester@example.com",
    "tester@example.test.evil.com",
    "tester@sub.example.test",
    "tester@gmail.com@example.test",
    "real@gmail.com\n@example.test",
    "@example.test",
    "tester@example.testx",
    "tester example@example.test",
    "",
  ])("rejects %j", (email) => {
    expect(parseDevLoginEmail(email)).toBeNull();
  });

  it("rejects non-strings", () => {
    for (const v of [undefined, null, 1, ["tester@example.test"], { email: "tester@example.test" }]) {
      expect(parseDevLoginEmail(v)).toBeNull();
    }
  });
});

describe("authorizeDevLogin", () => {
  it("returns the user for an @example.test email when enabled", () => {
    expect(authorizeDevLogin({ email: "tester@example.test" }, DEV)).toEqual({
      email: "tester@example.test",
      name: "tester",
    });
  });

  it("rejects non-@example.test emails", () => {
    expect(authorizeDevLogin({ email: "owner@gmail.com" }, DEV)).toBeNull();
    expect(authorizeDevLogin({}, DEV)).toBeNull();
    expect(authorizeDevLogin(undefined, DEV)).toBeNull();
  });

  it("rejects everything when the gate is closed (defence in depth)", () => {
    const email = { email: "tester@example.test" };
    expect(authorizeDevLogin(email, { NODE_ENV: "production", DEV_LOGIN: "1" })).toBeNull();
    expect(authorizeDevLogin(email, { NODE_ENV: "development" })).toBeNull();
  });
});
