import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireConnection } from "@/lib/connections";
import { idSchema } from "@/lib/decide";
import { buildPairPool, parsePairPicksQuery } from "@/lib/pairPool";
import { createPoolFetchers, loadPoolPerson, warnPoolFetchFailed } from "@/lib/pairPoolLoader";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/**
 * GET /api/watch-together/[userId]/picks — "Tonight for you both" (spec §5.6).
 * A ranked pool of movies and TV for the signed-in user and a connected friend.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const myId = session.user.id;

    // 404 for a malformed id, no such user and not connected alike, so ids can't be probed.
    const id = idSchema.safeParse((await params).userId);
    if (!id.success) return notFound();
    const partnerId = id.data;
    if (!(await requireConnection(myId, partnerId))) return notFound();

    const query = parsePairPicksQuery(req.nextUrl.searchParams);
    if (!query.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

    const [me, partner] = await Promise.all([loadPoolPerson(myId), loadPoolPerson(partnerId)]);

    const result = await buildPairPool({
      me: me.person,
      partner: partner.person,
      partnerName: partner.name,
      selection: query.data.selection,
      sharedOnly: query.data.sharedOnly,
      today: new Date(),
      fetchers: createPoolFetchers(),
      onError: warnPoolFetchFailed,
    });
    if (result.discoverFailed && result.pool.length === 0) {
      return NextResponse.json({ error: "Failed to load picks" }, { status: 502 });
    }

    // Partner is { id, name } only: no email from new routes (§5.5, F7).
    return NextResponse.json({
      partner: { id: partnerId, name: partner.name },
      pool: result.pool,
      services: result.services,
      coldStart: result.coldStart,
      // Counts only (no titles): the UI shows "rated 4 of 10"
      signals: result.signals,
      // Some TMDB calls failed: the UI can say "some picks couldn't load"
      partial: result.partial,
    });
  } catch (error) {
    console.error("Pair picks error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to load picks" }, { status: 500 });
  }
}
