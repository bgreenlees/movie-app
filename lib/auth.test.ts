import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Proves the real NextAuth config in lib/auth.ts only registers dev-login when
// both gates are open. NextAuth and Prisma are mocked: no network, no database.
const nextAuth = vi.hoisted(() => vi.fn((config: unknown) => {
  void config;
  return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
}));
vi.mock("next-auth", () => ({ default: nextAuth }));
const prisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), create: vi.fn() },
}));
vi.mock("./db", () => ({ prisma }));
vi.mock("./invites", () => ({ convertInvites: vi.fn() }));
// "server-only" throws outside a React Server Components build; Vitest is neither.
vi.mock("server-only", () => ({}));

async function providerIds(env: { NODE_ENV: string; DEV_LOGIN?: string; VERCEL_ENV?: string }) {
  vi.resetModules();
  nextAuth.mockClear();
  vi.stubEnv("NODE_ENV", env.NODE_ENV);
  vi.stubEnv("VERCEL_ENV", env.VERCEL_ENV as string);
  if (env.DEV_LOGIN === undefined) vi.stubEnv("DEV_LOGIN", undefined as unknown as string);
  else vi.stubEnv("DEV_LOGIN", env.DEV_LOGIN);
  await import("./auth");
  type P = { id: string; options?: { id?: string } };
  const config = nextAuth.mock.calls[0][0] as { providers: P[] };
  // Auth.js resolves a provider's id as options.id ?? id.
  return config.providers.map((p) => p.options?.id ?? p.id);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("lib/auth providers", () => {
  it("has only Google when NODE_ENV=production, even with DEV_LOGIN=1", async () => {
    expect(await providerIds({ NODE_ENV: "production", DEV_LOGIN: "1" })).toEqual(["google"]);
  });

  it("has only Google on a Vercel Preview with NODE_ENV overridden to development", async () => {
    expect(
      await providerIds({ NODE_ENV: "development", DEV_LOGIN: "1", VERCEL_ENV: "preview" }),
    ).toEqual(["google"]);
  });

  it("has only Google when DEV_LOGIN is unset", async () => {
    expect(await providerIds({ NODE_ENV: "development" })).toEqual(["google"]);
  });

  it("adds dev-login only in development with DEV_LOGIN=1", async () => {
    expect(await providerIds({ NODE_ENV: "development", DEV_LOGIN: "1" })).toEqual([
      "google",
      "dev-login",
    ]);
  });
});

describe("lib/auth signIn callback", () => {
  type SignIn = (params: { account?: { provider: string } | null; profile?: { email_verified?: unknown } }) => Promise<boolean>;
  async function signInCallback() {
    vi.resetModules();
    nextAuth.mockClear();
    await import("./auth");
    const config = nextAuth.mock.calls[0][0] as { callbacks: { signIn: SignIn } };
    return config.callbacks.signIn;
  }

  it("accepts a Google profile whose email is verified", async () => {
    const signIn = await signInCallback();
    expect(await signIn({ account: { provider: "google" }, profile: { email_verified: true } })).toBe(true);
  });

  it("rejects a Google profile whose email is unverified or not stated", async () => {
    const signIn = await signInCallback();
    for (const email_verified of [false, undefined, "true", 1]) {
      expect(await signIn({ account: { provider: "google" }, profile: { email_verified } })).toBe(false);
    }
    expect(await signIn({ account: { provider: "google" } })).toBe(false);
  });

  it("leaves dev-login to its own gates", async () => {
    const signIn = await signInCallback();
    expect(await signIn({ account: { provider: "dev-login" } })).toBe(true);
  });
});

describe("lib/auth jwt callback (session revocation, F8)", () => {
  type Token = Record<string, unknown>;
  type Jwt = (params: { token: Token; user?: { email?: string | null; name?: string | null } }) => Promise<Token | null>;
  async function jwtCallback() {
    vi.resetModules();
    nextAuth.mockClear();
    await import("./auth");
    const config = nextAuth.mock.calls[0][0] as { callbacks: { jwt: Jwt } };
    return config.callbacks.jwt;
  }
  const NOW = 1_800_000_000_000;

  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.user.create.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("copies sessionVersion into the token at sign-in", async () => {
    const jwt = await jwtCallback();
    prisma.user.findUnique.mockResolvedValue({ id: "u1", sessionVersion: 4 });
    const token = await jwt({ token: {}, user: { email: "a@example.test" } });
    expect(token).toMatchObject({ id: "u1", sessionVersion: 4, checkedAt: NOW });
  });

  it("skips the database while the last check is recent", async () => {
    const jwt = await jwtCallback();
    const token = { id: "u1", sessionVersion: 0, checkedAt: NOW - 1000 };
    expect(await jwt({ token })).toBe(token);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("keeps a current token and refreshes checkedAt after the window", async () => {
    const jwt = await jwtCallback();
    prisma.user.findUnique.mockResolvedValue({ sessionVersion: 0 });
    const token = await jwt({ token: { id: "u1", sessionVersion: 0, checkedAt: NOW - 10 * 60_000 } });
    expect(token).toMatchObject({ id: "u1", checkedAt: NOW });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { sessionVersion: true },
    });
  });

  it("ends the session after sign-out-everywhere", async () => {
    const jwt = await jwtCallback();
    prisma.user.findUnique.mockResolvedValue({ sessionVersion: 1 });
    expect(await jwt({ token: { id: "u1", sessionVersion: 0, checkedAt: NOW - 10 * 60_000 } })).toBeNull();
  });

  it("ends the session when the account has been deleted", async () => {
    const jwt = await jwtCallback();
    prisma.user.findUnique.mockResolvedValue(null);
    expect(await jwt({ token: { id: "u1", sessionVersion: 0 } })).toBeNull();
  });

  it("ends a token without a user id", async () => {
    const jwt = await jwtCallback();
    expect(await jwt({ token: {} })).toBeNull();
  });

  it("keeps the token, unrefreshed, if the database check fails", async () => {
    const jwt = await jwtCallback();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    prisma.user.findUnique.mockRejectedValue(new Error("down"));
    const stale = NOW - 10 * 60_000;
    const token = await jwt({ token: { id: "u1", sessionVersion: 0, checkedAt: stale } });
    expect(token).toMatchObject({ id: "u1", checkedAt: stale });
    spy.mockRestore();
  });
});
