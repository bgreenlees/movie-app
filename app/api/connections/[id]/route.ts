import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// PATCH — accept a pending request (addressee only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;
  const { id } = await params;

  const connection = await prisma.userConnection.findUnique({ where: { id } });
  if (!connection || connection.addresseeId !== userId || connection.status !== "PENDING") {
    return notFound();
  }

  const updated = await prisma.userConnection.update({
    where: { id },
    data: { status: "ACCEPTED" },
  });

  return NextResponse.json({ connection: updated });
}

/**
 * DELETE — decline, cancel or remove a connection.
 *
 * - Addressee on a PENDING request: decline. The row is kept as DECLINED so
 *   the requester can't send again (see POST /api/connections).
 * - Requester on their own PENDING request: cancel (row deleted).
 * - Either side of an ACCEPTED connection: remove the friend (row deleted).
 * - DECLINED rows: only the addressee may delete one (lifting the decline);
 *   to the requester it doesn't exist, so they can't clear it and re-send.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;
  const { id } = await params;

  const connection = await prisma.userConnection.findUnique({ where: { id } });
  if (!connection) return notFound();
  const isRequester = connection.requesterId === userId;
  const isAddressee = connection.addresseeId === userId;
  if (!isRequester && !isAddressee) return notFound();

  if (connection.status === "PENDING" && isAddressee) {
    await prisma.userConnection.update({ where: { id }, data: { status: "DECLINED" } });
    return NextResponse.json({ ok: true });
  }
  if (connection.status === "DECLINED" && !isAddressee) return notFound();

  await prisma.userConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
