import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export default function Home() {
  return (
    <main className="force-dark relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-8 bg-bg">

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
        <div className="flex items-center justify-center mb-6">
          <Logo variant="horizontal" size={48} />
        </div>

        <h1 className="text-5xl font-bold mb-4 tracking-tight text-text">
          Never wonder what to watch.
        </h1>
        <p className="text-lg mb-10 text-muted">
          Track movies and shows you want to watch, keep tabs on what you&apos;ve seen, and get picks tailored to your taste.
        </p>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="px-6 py-3 rounded-md font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--gradient-brand)", color: "#fff" }}
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

        <p className="text-xs mt-10 text-muted">
          Your watchlist. Your taste. Your picks.
        </p>
      </div>
    </main>
  );
}
