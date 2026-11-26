import Link from "next/link";
import { auth } from "@/lib/auth";
import PublicHeader from "@/components/layout/PublicHeader";
import StatusPage, { primaryActionClass, secondaryActionClass } from "@/components/ui/StatusPage";

export default async function NotFound() {
  // A failed session lookup must never break the 404 page itself.
  const session = await auth().catch(() => null);
  const isLoggedIn = !!session?.user;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--secondary-bg)" }}>
      <PublicHeader isLoggedIn={isLoggedIn} />
      <main>
        <StatusPage
          eyebrow="404"
          title="We couldn't find that page"
          message="The link may be broken, or the movie or show may have been removed."
        >
          <Link
            href={isLoggedIn ? "/search" : "/"}
            className={primaryActionClass}
            style={{ backgroundColor: "var(--accent)" }}
          >
            {isLoggedIn ? "Back to Discover" : "Go home"}
          </Link>
          {!isLoggedIn && (
            <Link href="/login" className={secondaryActionClass} style={{ color: "var(--primary)" }}>
              Sign in
            </Link>
          )}
        </StatusPage>
      </main>
    </div>
  );
}
