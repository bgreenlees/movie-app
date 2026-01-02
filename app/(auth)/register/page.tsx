import Link from "next/link";
import RegisterForm from "@/components/auth/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8" style={{ backgroundColor: "var(--secondary-bg)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
            Create Account
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Start tracking your movie watchlist
          </p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-sm">
          <RegisterForm />

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-medium hover:underline"
                style={{ color: "var(--accent)" }}
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
