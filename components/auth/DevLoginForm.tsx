"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

/**
 * Local-development sign-in (issue #69). Rendered only when the server says the
 * dev-login provider is enabled (see lib/devLogin.ts). No password: the server
 * accepts only @example.test addresses, and only outside production.
 */
export default function DevLoginForm() {
  const [email, setEmail] = useState("tester@example.test");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const res = await signIn("dev-login", { email, redirect: false });
    if (!res || res.error) {
      setIsLoading(false);
      setError("Sign-in failed. Use an address ending in @example.test.");
      return;
    }
    router.push("/search");
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby="dev-login-heading"
      className="mt-6 rounded-xl p-4"
      style={{ border: "1px dashed rgba(251,191,36,0.6)", background: "rgba(251,191,36,0.06)" }}
    >
      <h2 id="dev-login-heading" className="text-sm font-semibold text-warning">
        Dev login
      </h2>
      <p className="mt-1 text-xs text-muted">
        Local development only. Any <code>@example.test</code> address, no password.
      </p>
      <label htmlFor="dev-login-email" className="mt-3 block text-xs font-medium" style={{ color: "#d1d1d6" }}>
        Email
      </label>
      <input
        id="dev-login-email"
        name="email"
        type="email"
        required
        autoComplete="off"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "dev-login-error" : undefined}
        className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
        style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.15)", color: "#f5f5f7" }}
      />
      {error && (
        <p id="dev-login-error" role="alert" className="mt-2 text-xs" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isLoading}
        className="mt-3 w-full rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--color-warning)", color: "#1c1917" }}
      >
        {isLoading ? "Signing in…" : "Sign in (dev)"}
      </button>
    </form>
  );
}
