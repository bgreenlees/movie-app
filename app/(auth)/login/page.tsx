import Link from "next/link";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8" style={{ backgroundColor: "var(--secondary-bg)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
            Welcome Back
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Log in to your Movie Watchlist account
          </p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm">
          <LoginForm />

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Don't have an account?{" "}
              <Link
                href="/register"
                className="font-medium hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
