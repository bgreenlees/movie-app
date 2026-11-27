import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TVWatchStatus } from "@prisma/client";
import {
  parseEnum,
  parsePlatform,
  parseProgress,
  parseRating,
  parseReview,
  readJsonObject,
} from "@/lib/validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id as string;
    const { id } = await params;

    // Validate the body before touching the database. Fields left out are
    // untouched; null clears a field.
    const body = await readJsonObject(req);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
    const b = body.value;
    const status = b.status === undefined ? undefined : parseEnum(b.status, Object.values(TVWatchStatus), "status");
    const platform = b.platform === undefined ? undefined : parsePlatform(b.platform);
    const rating = b.rating === undefined ? undefined : parseRating(b.rating);
    const review = b.review === undefined ? undefined : parseReview(b.review);
    const currentSeason = b.currentSeason === undefined ? undefined : parseProgress(b.currentSeason, "currentSeason");
    const currentEpisode = b.currentEpisode === undefined ? undefined : parseProgress(b.currentEpisode, "currentEpisode");
    for (const r of [status, platform, rating, review, currentSeason, currentEpisode]) {
      if (r && !r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    }

    const existing = await prisma.tVWatchlistEntry.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const entry = await prisma.tVWatchlistEntry.update({
      where: { id },
      data: {
        ...(status?.ok && { status: status.value }),
        ...(platform?.ok && { platform: platform.value }),
        ...(rating?.ok && { rating: rating.value }),
        ...(review?.ok && { review: review.value }),
        ...(currentSeason?.ok && { currentSeason: currentSeason.value }),
        ...(currentEpisode?.ok && { currentEpisode: currentEpisode.value }),
      },
      include: { tvShow: true },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("TV watchlist update error:", error);
    return NextResponse.json({ error: "Failed to update TV watchlist entry" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id as string;
    const { id } = await params;

    const existing = await prisma.tVWatchlistEntry.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.tVWatchlistEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("TV watchlist delete error:", error);
    return NextResponse.json({ error: "Failed to delete TV watchlist entry" }, { status: 500 });
  }
}
