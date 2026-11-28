import { redirect } from "next/navigation";
import { safeCallbackUrl } from "@/lib/callbackUrl";

// There is one sign-in page (issue #181): Google sign-in creates the account on
// first use, so /register just forwards to /login and keeps the (validated) callbackUrl.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = params.callbackUrl;
  const target = safeCallbackUrl(raw, "");
  redirect(target ? `/login?callbackUrl=${encodeURIComponent(target)}` : "/login");
}
