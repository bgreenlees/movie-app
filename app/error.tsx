"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import StatusPage, { primaryActionClass, secondaryActionClass } from "@/components/ui/StatusPage";

// Catches errors outside the (main) layout (e.g. /movie/[id], /login). No session lookup here:
// an error boundary should depend on as little as possible.
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--secondary-bg)" }}>
      <nav className="border-b border-[var(--border)] bg-[var(--card-bg)]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3">
          <Link href="/" className="text-xl font-bold" style={{ color: "var(--primary)" }}>
            What&apos;s Up Next
          </Link>
        </div>
      </nav>
      <main id="main-content">
        <StatusPage
          eyebrow="Something went wrong"
          title="That didn't work"
          message="An unexpected error occurred. You can try again, or go back home."
        >
          <button
            type="button"
            onClick={() =>
          // reset() alone only re-renders the client; refresh() refetches the server-rendered page.
          startTransition(() => {
            router.refresh();
            reset();
          })
        }
            className={primaryActionClass}
            style={{ backgroundColor: "var(--accent)" }}
          >
            Try again
          </button>
          <Link href="/" className={secondaryActionClass} style={{ color: "var(--primary)" }}>
            Go home
          </Link>
        </StatusPage>
      </main>
    </div>
  );
}
