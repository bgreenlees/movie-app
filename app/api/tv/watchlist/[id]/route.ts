import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
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

    const { status, platform, rating, review, currentSeason, currentEpisode } = await req.json();

    const entry = await prisma.tVWatchlistEntry.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(platform !== undefined && { platform: platform || null }),
        ...(rating !== undefined && { rating: rating || null }),
        ...(review !== undefined && { review: review || null }),
        ...(currentSeason !== undefined && { currentSeason: currentSeason || null }),
        ...(currentEpisode !== undefined && { currentEpisode: currentEpisode || null }),
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
