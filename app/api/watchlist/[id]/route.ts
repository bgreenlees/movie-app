import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WatchStatus } from "@prisma/client";
import {
  parseEnum,
  parsePlatform,
  parseRating,
  parseReview,
  parseWatchType,
  readJsonObject,
} from "@/lib/validation";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    const { id } = await params;

    // Validate the body before touching the database. Fields left out are
    // untouched; null clears a field.
    const body = await readJsonObject(req);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
    const b = body.value;
    const status = b.status === undefined ? undefined : parseEnum(b.status, Object.values(WatchStatus), "status");
    const platform = b.platform === undefined ? undefined : parsePlatform(b.platform);
    const watchType = b.watchType === undefined ? undefined : parseWatchType(b.watchType);
    const rating = b.rating === undefined ? undefined : parseRating(b.rating);
    const review = b.review === undefined ? undefined : parseReview(b.review);
    for (const r of [status, platform, watchType, rating, review]) {
      if (r && !r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    }

    // Verify the entry belongs to the user
    const existingEntry = await prisma.watchlistEntry.findUnique({
      where: { id },
    });

    if (!existingEntry || existingEntry.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const entry = await prisma.watchlistEntry.update({
      where: {
        id,
      },
      data: {
        ...(status?.ok && { status: status.value }),
        ...(status?.ok && status.value === "WATCHED" && { watchedAt: new Date() }),
        ...(status?.ok && status.value === "WANT_TO_WATCH" && { watchedAt: null }),
        ...(platform?.ok && { platform: platform.value }),
        ...(watchType?.ok && { watchType: watchType.value }),
        ...(rating?.ok && { rating: rating.value }),
        ...(review?.ok && { review: review.value }),
      },
      include: {
        movie: true,
      },
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Update watchlist error:", error);
    return NextResponse.json(
      { error: "Failed to update watchlist entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    const { id } = await params;

    // Verify the entry belongs to the user
    const existingEntry = await prisma.watchlistEntry.findUnique({
      where: { id },
    });

    if (!existingEntry || existingEntry.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.watchlistEntry.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete watchlist error:", error);
    return NextResponse.json(
      { error: "Failed to delete watchlist entry" },
      { status: 500 }
    );
  }
}
