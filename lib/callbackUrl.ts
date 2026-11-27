/**
 * Where to send someone after they sign in (issue #151).
 *
 * SECURITY: `callbackUrl` comes from the query string, so anyone can craft a
 * link to /login?callbackUrl=https://evil.example. Only same-origin relative
 * paths are accepted; everything else falls back. Rejected on purpose:
 *   - anything not starting with "/" (absolute URLs, "javascript:", bare words)
 *   - "//host" (protocol-relative, goes off-site)
 *   - any backslash ("/\host": browsers treat "\" as "/", so it becomes "//host")
 *   - control characters, incl. tab/newline (browsers strip them, so "/\t/host" becomes "//host")
 */
export const DEFAULT_CALLBACK_URL = "/search";

const MAX_LENGTH = 2000;

export function safeCallbackUrl(raw: unknown, fallback: string = DEFAULT_CALLBACK_URL): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return fallback;
  if (value.length === 0 || value.length > MAX_LENGTH) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

/** The /login URL that returns to `path` after sign-in, or plain /login when `path` is unsafe. */
export function loginUrlWithCallback(path: string): string {
  const safe = safeCallbackUrl(path, "");
  return safe ? `/login?callbackUrl=${encodeURIComponent(safe)}` : "/login";
}
