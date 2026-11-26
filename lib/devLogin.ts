import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";

/**
 * Development-only sign-in, so agents and local testing can sign in without
 * Google and without minting session cookies by hand (issue #69).
 *
 * SECURITY: two independent gates must both pass:
 *   1. NODE_ENV is not "production". `next build`/`next start` force
 *      NODE_ENV=production, so Vercel Production AND Preview can never pass this.
 *   2. DEV_LOGIN is exactly "1". It is set only in a developer's local
 *      `.env.local`, never in Vercel.
 * Even then, only `@example.test` addresses are accepted (a reserved TLD that
 * can never belong to a real user), so it can't impersonate anyone.
 * There is no password and no secret: the double gate is the protection.
 */

export const DEV_LOGIN_PROVIDER_ID = "dev-login";

type Env = Partial<Record<"NODE_ENV" | "DEV_LOGIN", string | undefined>>;

export function isDevLoginEnabled(env: Env = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEV_LOGIN === "1";
}

// Anchored, single-line, lowercase local part + the reserved example.test domain.
const DEV_EMAIL = /^[a-z0-9][a-z0-9._+-]{0,63}@example\.test$/;

/** Returns the normalised email if it's an allowed dev-login address, else null. */
export function parseDevLoginEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  return DEV_EMAIL.test(email) ? email : null;
}

/**
 * The provider's `authorize`. Re-checks the gate at call time (defence in
 * depth) and returns the user for the `jwt` callback, which finds or creates
 * the database row by email.
 */
export function authorizeDevLogin(
  credentials: Partial<Record<string, unknown>> | undefined,
  env: Env = process.env,
): { email: string; name: string } | null {
  if (!isDevLoginEnabled(env)) return null;
  const email = parseDevLoginEmail(credentials?.email);
  if (!email) return null;
  return { email, name: email.split("@")[0] };
}

/** The dev-login provider, or nothing when the gate is closed. */
export function devLoginProviders(env: Env = process.env): Provider[] {
  if (!isDevLoginEnabled(env)) return [];
  return [
    Credentials({
      id: DEV_LOGIN_PROVIDER_ID,
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: (credentials) => authorizeDevLogin(credentials, env),
    }),
  ];
}
