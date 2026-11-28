import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * "Sign out everywhere": bumps the user's sessionVersion, so every session
 * token issued before now (this device's too) stops working within the
 * re-check window in lib/sessionVersion.ts. The client then signs this device
 * out straight away.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { count } = await prisma.user.updateMany({
    where: { id: session.user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  if (count === 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ ok: true });
}
