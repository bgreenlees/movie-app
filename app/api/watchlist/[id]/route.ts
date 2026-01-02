import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { status, watchedAt } = await req.json();

    const entry = await prisma.watchlistEntry.update({
      where: {
        id: params.id,
        userId: session.user.id,
      },
      data: {
        status: status || undefined,
        watchedAt: watchedAt !== undefined ? watchedAt : undefined,
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.watchlistEntry.delete({
      where: {
        id: params.id,
        userId: session.user.id,
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
