import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// PATCH — accept a pending request
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;
  const { id } = await params;

  const connection = await prisma.userConnection.findUnique({ where: { id } });
  if (!connection || connection.addresseeId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.userConnection.update({
    where: { id },
    data: { status: "ACCEPTED" },
  });

  return NextResponse.json({ connection: updated });
}

// DELETE — decline or remove a connection
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;
  const { id } = await params;

  const connection = await prisma.userConnection.findUnique({ where: { id } });
  if (!connection || (connection.requesterId !== userId && connection.addresseeId !== userId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.userConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
