import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — fetch accepted connections + pending incoming requests
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;

  const [accepted, pending] = await Promise.all([
    prisma.userConnection.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: userId }, { addresseeId: userId }],
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        addressee: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.userConnection.findMany({
      where: { addresseeId: userId, status: "PENDING" },
      include: {
        requester: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const friends = accepted.map((c) => ({
    connectionId: c.id,
    friend: c.requesterId === userId ? c.addressee : c.requester,
  }));

  return NextResponse.json({ friends, pending });
}

// POST — send a connection request by email
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) return NextResponse.json({ error: "No user found with that email" }, { status: 404 });
  if (target.id === userId) return NextResponse.json({ error: "You can't connect with yourself" }, { status: 400 });

  // Check for existing connection either direction
  const existing = await prisma.userConnection.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: userId },
      ],
    },
  });
  if (existing) return NextResponse.json({ error: "Connection already exists" }, { status: 409 });

  const connection = await prisma.userConnection.create({
    data: { requesterId: userId, addresseeId: target.id },
  });

  return NextResponse.json({ connection });
}
