import type { Metadata } from "next";
import DecideSession from "@/components/decide/DecideSession";

export const metadata: Metadata = { title: "Decide together — What's Up Next" };

/**
 * `/decide/[sessionId]`: one Watch Together vote (spec §5.3, §7). Signed-in
 * only (middleware); the API decides who may see the session and answers 404
 * to anyone else, which the client shows as the standard 404.
 */
export default async function DecidePage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <DecideSession sessionId={sessionId} />;
}
