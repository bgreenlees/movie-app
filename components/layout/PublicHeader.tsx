import Link from "next/link";

export default function PublicHeader({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card-bg)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold" style={{ color: "var(--primary)" }}>
          What&apos;s Up Next
        </Link>
        <Link
          href={isLoggedIn ? "/search" : "/login"}
          className="px-3 py-1.5 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {isLoggedIn ? "Open App" : "Sign In"}
        </Link>
      </div>
    </nav>
  );
}
