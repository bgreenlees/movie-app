import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24" style={{ backgroundColor: "var(--secondary-bg)" }}>
      <div className="text-center max-w-2xl">
        <h1 className="text-5xl font-bold mb-4" style={{ color: 'var(--primary)' }}>
          Movie Watchlist
        </h1>
        <p className="text-lg mb-8" style={{ color: 'var(--text-muted)' }}>
          Track movies you want to watch and have watched. Simple, clean, and inspired by Goodreads.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="px-6 py-3 text-white rounded-md transition-colors"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 border border-gray-300 rounded-md transition-colors hover:bg-white"
            style={{ color: 'var(--foreground)' }}
          >
            Log In
          </Link>
        </div>
      </div>
    </main>
  );
}
