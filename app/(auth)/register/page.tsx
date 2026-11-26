import Link from "next/link";
import RegisterForm from "@/components/auth/RegisterForm";

// Mirrors /login: black background with colour orbs and a dark glass card.
// (The card used to be bg-white, which made the Google button's light text
// invisible. See issue #66.)
export default function RegisterPage() {
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

      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-text">
            Create Account
          </h1>
          <p className="text-sm text-muted">
            Start tracking your movie watchlist
          </p>
        </div>

        <div style={{
          background: "rgba(20,20,20,0.75)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "20px",
          padding: "32px",
        }}>
          <RegisterForm />

          <div className="mt-6 text-center">
            <p className="text-sm text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium hover:underline text-accent-text"
              >
                Log in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
