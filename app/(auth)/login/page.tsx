import Link from "next/link";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden" style={{ backgroundColor: "#000" }}>

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

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm px-4">

        {/* Branding */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-4">
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
              <rect width="36" height="36" rx="8" fill="url(#logo-grad)"/>
              <path d="M10 26L14 10h2l4 12 4-12h2l4 16" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <defs>
                <linearGradient id="logo-grad" x1="0" y1="0" x2="36" y2="36">
                  <stop offset="0%" stopColor="#a855f7"/>
                  <stop offset="100%" stopColor="#3b82f6"/>
                </linearGradient>
              </defs>
            </svg>
            <span className="text-2xl font-bold tracking-tight" style={{ color: "#fff" }}>Flickpick</span>
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight" style={{ color: "#fff" }}>
            Welcome back.
          </h1>
          <p className="text-base" style={{ color: "#6e6e73" }}>
            Your personal cinema, personalised.
          </p>
        </div>

        {/* Glass card */}
        <div style={{
          background: "rgba(20,20,20,0.75)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          padding: "32px",
        }}>
          <LoginForm />

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: "#6e6e73" }}>
              New here?{" "}
              <Link
                href="/register"
                className="font-medium hover:underline"
                style={{ color: "#a855f7" }}
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-8" style={{ color: "#3a3a3c" }}>
          Your watchlist. Your taste. Your picks.
        </p>
      </div>
    </main>
  );
}
