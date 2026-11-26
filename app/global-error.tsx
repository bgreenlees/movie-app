"use client";

import { useEffect } from "react";
import "./globals.css";

// Replaces the root layout when it fails, so it must render its own <html> and <body>.
// Plain <a> instead of next/link: the router may be what broke.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="min-h-screen flex flex-col items-center justify-center text-center px-6">
          <p className="text-sm font-bold tracking-widest mb-3" style={{ color: "var(--accent)" }}>
            Something went wrong
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: "var(--primary)" }}>
            That didn&apos;t work
          </h1>
          <p className="text-base mb-8 max-w-md" style={{ color: "var(--text-muted)" }}>
            An unexpected error occurred. You can try again, or go back home.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={reset}
              className="px-5 py-2.5 rounded-md text-sm font-medium text-white"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="px-5 py-2.5 rounded-md text-sm font-medium text-center border border-[var(--border)]"
              style={{ color: "var(--primary)" }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
