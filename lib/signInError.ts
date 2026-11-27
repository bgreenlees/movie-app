// Messages for the `?error=` code Auth.js adds when it sends a failed sign-in back to
// /login (pages.error in lib/auth.config.ts). Only fixed strings are shown, never the
// query value itself, so a crafted link can't put its own text on the login page.

const MESSAGES: Record<string, string> = {
  // The signIn callback in lib/auth.ts said no: Google hasn't verified this email.
  AccessDenied:
    "Google couldn't confirm that email address is verified, so we can't sign you in with it. Verify it with Google, or use a different account.",
  Configuration: "Sign-in isn't working right now. Please try again in a few minutes.",
  Verification: "That sign-in link has expired or was already used. Please sign in again.",
};

const FALLBACK = "Something went wrong signing you in. Please try again.";

/** The message to show for an Auth.js error code, or null when there's no error. */
export function signInErrorMessage(code: unknown): string | null {
  const value = Array.isArray(code) ? code[0] : code;
  if (typeof value !== "string" || value === "") return null;
  return Object.hasOwn(MESSAGES, value) ? MESSAGES[value] : FALLBACK;
}
