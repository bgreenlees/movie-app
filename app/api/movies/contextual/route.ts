import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/apiGuard";
import { tmdb } from "@/lib/tmdb";
import { parsePage } from "@/lib/discoverPaging";
import { parseLocalHour, planContextualFeed } from "@/lib/contextualFeed";

export async function GET(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  const page = parsePage(req.nextUrl.searchParams.get("page"));
  if (page === null) {
    return NextResponse.json({ error: "Invalid page" }, { status: 400 });
  }

  // The hour is the browser's local hour (untrusted, validated 0-23 or ignored).
  const localHour = parseLocalHour(req.nextUrl.searchParams.get("hour"));
  const session = await auth();
  const userId = session?.user?.id as string | undefined;
  const hasRatings = userId
    ? (await prisma.watchlistEntry.count({ where: { userId, rating: { gte: 2 } } })) > 0
    : false;
  const plan = planContextualFeed(hasRatings, localHour);

  try {
    const data = plan.kind === "genres" ? await tmdb.getByGenre(plan.genres, page) : await tmdb.getTrending(page);
    const results = (data.results || []).filter((m) => m.poster_path);
    return NextResponse.json({ results, timeSlot: plan.label });
  } catch {
    return NextResponse.json({ results: [], timeSlot: plan.label });
  }
}
