import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-8" style={{ backgroundColor: "#000" }}>

      {/* Animated colour orbs */}
      <div style={{
        position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
      }}>
        {/* Purple — top left */}
        <div style={{
          position: "absolute", top: "10%", left: "15%",
          width: 520, height: 520,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(168,85,247,0.45) 0%, transparent 70%)",
          filter: "blur(40px)",
          animation: "orb-drift-1 14s ease-in-out infinite",
        }} />
        {/* Blue — bottom right */}
        <div style={{
          position: "absolute", bottom: "10%", right: "10%",
          width: 480, height: 480,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)",
          filter: "blur(40px)",
          animation: "orb-drift-2 18s ease-in-out infinite",
        }} />
        {/* Pink — top right */}
        <div style={{
          position: "absolute", top: "20%", right: "20%",
          width: 360, height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(236,72,153,0.3) 0%, transparent 70%)",
          filter: "blur(40px)",
          animation: "orb-drift-3 22s ease-in-out infinite",
        }} />
      </div>

      <div className="relative z-10 text-center max-w-2xl">
        <div className="flex items-center justify-center gap-3 mb-6">
          <svg width="48" height="48" viewBox="0 0 36 36" fill="none">
            <rect width="36" height="36" rx="8" fill="url(#logo-grad-home)" />
            <path d="M10 26L14 10h2l4 12 4-12h2l4 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <defs>
              <linearGradient id="logo-grad-home" x1="0" y1="0" x2="36" y2="36">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>What&apos;s Up Next</span>
        </div>

        <h1 className="text-5xl font-bold mb-4 tracking-tight" style={{ color: "#fff" }}>
          Never wonder what to watch.
        </h1>
        <p className="text-lg mb-10" style={{ color: "#a1a1a6" }}>
          Track movies and shows you want to watch, keep tabs on what you&apos;ve seen, and get picks tailored to your taste.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/register"
            className="px-6 py-3 rounded-md font-medium transition-opacity hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #a855f7, #3b82f6)", color: "#fff" }}
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="px-6 py-3 rounded-md font-medium transition-colors"
            style={{ border: "1px solid rgba(255,255,255,0.15)", color: "#fff" }}
          >
            Log In
          </Link>
        </div>

        <p className="text-xs mt-10" style={{ color: "#3a3a3c" }}>
          Your watchlist. Your taste. Your picks.
        </p>
      </div>
    </main>
  );
}
