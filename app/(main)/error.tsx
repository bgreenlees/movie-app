"use client";

import Link from "next/link";
import { useEffect } from "react";
import StatusPage, { primaryActionClass, secondaryActionClass } from "@/components/ui/StatusPage";

// Rendered inside the (main) layout, so the signed-in nav stays visible.
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Details go to the console / server logs only, never to the user.
    console.error(error);
  }, [error]);

  return (
    <StatusPage
      eyebrow="Something went wrong"
      title="That didn't work"
      message="An unexpected error occurred. You can try again, or head back to Discover."
    >
      <button
        type="button"
        onClick={reset}
        className={primaryActionClass}
        style={{ backgroundColor: "var(--accent)" }}
      >
        Try again
      </button>
      <Link href="/search" className={secondaryActionClass} style={{ color: "var(--primary)" }}>
        Back to Discover
      </Link>
    </StatusPage>
  );
}
