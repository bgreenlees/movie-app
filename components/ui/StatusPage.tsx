import type { ReactNode } from "react";

interface StatusPageProps {
  /** Small label above the title, e.g. "404". */
  eyebrow: string;
  title: string;
  message: string;
  /** Buttons / links rendered under the message. */
  children: ReactNode;
}

/** Shared layout for the 404 and error pages. Pure presentation: no hooks, safe in server and client components. */
export default function StatusPage({ eyebrow, title, message, children }: StatusPageProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-20 sm:py-28 max-w-xl mx-auto">
      <p className="text-sm font-bold tracking-widest mb-3" style={{ color: "var(--color-accent-text)" }}>
        {eyebrow}
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: "var(--primary)" }}>
        {title}
      </h1>
      <p className="text-base mb-8" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">{children}</div>
    </div>
  );
}

export const primaryActionClass =
  "px-5 py-2.5 rounded-md text-sm font-medium text-white text-center transition-opacity hover:opacity-90";
export const secondaryActionClass =
  "px-5 py-2.5 rounded-md text-sm font-medium text-center border border-[var(--border)] transition-colors hover:bg-[var(--hover-bg)]";
