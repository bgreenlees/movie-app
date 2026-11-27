import { afterEach, describe, expect, it, vi } from "vitest";

// Proves the real NextAuth config in lib/auth.ts only registers dev-login when
// both gates are open. NextAuth and Prisma are mocked: no network, no database.
const nextAuth = vi.hoisted(() => vi.fn((config: unknown) => {
  void config;
  return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
}));
vi.mock("next-auth", () => ({ default: nextAuth }));
vi.mock("./db", () => ({ prisma: {} }));

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
