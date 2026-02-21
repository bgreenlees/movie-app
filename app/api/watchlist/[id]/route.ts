import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify the entry belongs to the user
    const existingEntry = await prisma.watchlistEntry.findUnique({
      where: { id },
    });

    if (!existingEntry || existingEntry.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { status, platform, watchType, rating, review } = await req.json();

    const entry = await prisma.watchlistEntry.update({
      where: {
        id,
      },
      data: {
        ...(status !== undefined && { status }),
        ...(status === "WATCHED" && { watchedAt: new Date() }),
        ...(status === "WANT_TO_WATCH" && { watchedAt: null }),
        ...(platform !== undefined && { platform: platform || null }),
        ...(watchType !== undefined && { watchType: watchType || null }),
        ...(rating !== undefined && { rating: rating || null }),
        ...(review !== undefined && { review: review || null }),
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

    const { id } = await params;

    // Verify the entry belongs to the user
    const existingEntry = await prisma.watchlistEntry.findUnique({
      where: { id },
    });

    if (!existingEntry || existingEntry.userId !== session.user.id) {
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
