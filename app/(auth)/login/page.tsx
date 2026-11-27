import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import LoginForm from "@/components/auth/LoginForm";
import { isDevLoginEnabled } from "@/lib/devLogin";
import { safeCallbackUrl } from "@/lib/callbackUrl";
import { signInErrorMessage } from "@/lib/signInError";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const error = signInErrorMessage(params.error);
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  return (
    <main className="force-dark relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg">

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
          <div className="flex items-center justify-center mb-4">
            <Logo variant="horizontal" size={40} />
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight text-text">
            Welcome back.
          </h1>
          <p className="text-base text-muted">
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
          {error && (
            <p
              role="alert"
              className="mb-5 rounded-xl px-4 py-3 text-sm text-text"
              style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)" }}
            >
              {error}
            </p>
          )}
          <LoginForm devLogin={isDevLoginEnabled()} callbackUrl={callbackUrl} />

          <div className="mt-6 text-center">
            <p className="text-sm text-muted">
              New here?{" "}
              <Link
                href="/register"
                className="font-medium hover:underline text-accent-text"
              >
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs mt-8 text-muted">
          Your watchlist. Your taste. Your picks.
        </p>
      </div>
    </main>
  );
}
