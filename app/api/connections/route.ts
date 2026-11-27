import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Most PENDING outgoing requests one user may have at once. */
export const MAX_PENDING_OUTGOING = 20;

/**
 * The single response for every "request accepted for processing" outcome:
 * unknown email, new request, already pending, already friends, or declined.
 * Identical status and body, so the endpoint can't be used to find out
 * whether an email has an account (or whether someone declined you).
 */
const neutralOk = () => NextResponse.json({ ok: true });

/**
 * Called when no account has this email. Deliberately does nothing yet:
 * email invites (#135) hook in here. Whatever it does, the caller still
 * returns the neutral response.
 */
async function handleNoAccount(email: string, requesterId: string): Promise<void> {
  void email;
  void requesterId;
}

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

  const body = await req.json().catch(() => null);
  const raw = body && typeof body === "object" ? (body as { email?: unknown }).email : undefined;
  const email = typeof raw === "string" ? raw.trim() : "";
  if (!email || email.length > 320) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // Your own address isn't secret to you, so this can be a clear error.
  const ownEmail = session.user.email?.trim().toLowerCase();
  if (ownEmail && email.toLowerCase() === ownEmail) {
    return NextResponse.json({ error: "You can't connect with yourself" }, { status: 400 });
  }

  // Checked before the lookup, so it applies the same way to every email.
  const pendingOutgoing = await prisma.userConnection.count({
    where: { requesterId: userId, status: "PENDING" },
  });
  if (pendingOutgoing >= MAX_PENDING_OUTGOING) {
    return NextResponse.json(
      {
        error: `You have ${MAX_PENDING_OUTGOING} requests waiting for an answer. Try again once some have been accepted.`,
      },
      { status: 429 },
    );
  }

  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!target) {
    await handleNoAccount(email, userId);
    return neutralOk();
  }
  if (target.id === userId) {
    return NextResponse.json({ error: "You can't connect with yourself" }, { status: 400 });
  }

  // Any existing row, in either direction and in any status (PENDING,
  // ACCEPTED, DECLINED), means no new request. A DECLINED row is never
  // reset here, so the person who declined isn't asked again.
  const existing = await prisma.userConnection.findFirst({
    where: {
      OR: [
        { requesterId: userId, addresseeId: target.id },
        { requesterId: target.id, addresseeId: userId },
      ],
    },
    select: { id: true, status: true, addresseeId: true },
  });
  if (existing) {
    // The one exception: the person who declined now asks the other way
    // round. That's their choice to make, so lift the decline and send it.
    if (existing.status === "DECLINED" && existing.addresseeId === userId) {
      await prisma.$transaction([
        prisma.userConnection.delete({ where: { id: existing.id } }),
        prisma.userConnection.create({ data: { requesterId: userId, addresseeId: target.id } }),
      ]);
    }
    return neutralOk();
  }

  try {
    await prisma.userConnection.create({
      data: { requesterId: userId, addresseeId: target.id },
    });
  } catch (err) {
    // A concurrent identical request won the race: same outcome.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  return neutralOk();
}
