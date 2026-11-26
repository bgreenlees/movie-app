import Link from "next/link";
import StatusPage, { primaryActionClass } from "@/components/ui/StatusPage";

// Rendered inside the (main) layout, so the signed-in nav stays visible.
export default function MainNotFound() {
  return (
    <StatusPage
      eyebrow="404"
      title="We couldn't find that page"
      message="The link may be broken, or the movie or show may have been removed."
    >
      <Link href="/search" className={primaryActionClass} style={{ backgroundColor: "var(--accent)" }}>
        Back to Discover
      </Link>
    </StatusPage>
  );
}
