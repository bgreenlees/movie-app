import { redirect } from "next/navigation";
import { whatToWatchWithHref } from "../../../../lib/watchWith";

/**
 * Watch Together used to be its own page. Its shelves now live on What to
 * Watch (pick a friend there), so old links and bookmarks land there.
 */
export default async function WatchTogetherRedirect({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  redirect(whatToWatchWithHref(userId));
}
