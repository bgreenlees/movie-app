import { after, NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createRateLimiter } from "@/lib/rateLimit";
import { deliverInvite, recordInvite } from "@/lib/invites";
import { isValidEmail, MAX_EMAIL_LENGTH, normalizeEmail } from "../../../lib/emailAddress";

/** Most PENDING outgoing requests one user may have at once. */
export const MAX_PENDING_OUTGOING = 20;

/**
 * The single response for every "request accepted for processing" outcome:
 * unknown email, new request, already pending, already friends, or declined.
 * Identical status and body, so the endpoint can't be used to find out
 * whether an email has an account (or whether someone declined you).
 */
const neutralOk = () => NextResponse.json({ ok: true });

/** 10 invites per user per day. Per server instance; see lib/rateLimit.ts. */
const allowInvite = createRateLimiter({ limit: 10, windowMs: 24 * 60 * 60 * 1000 });

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
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });
  // Depends only on the text typed, never on whether an account exists.
  if (email.length > MAX_EMAIL_LENGTH || !isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  // Your own address isn't secret to you, so this can be a clear error.
  const ownEmail = session.user.email?.trim().toLowerCase();
  if (ownEmail && email.toLowerCase() === ownEmail) {
    return NextResponse.json({ error: "You can't connect with yourself" }, { status: 400 });
  }

  const capped = () =>
    NextResponse.json(
      {
        error: `You have ${MAX_PENDING_OUTGOING} requests waiting for an answer. Try again once some have been accepted.`,
      },
      { status: 429 },
    );
  // Unanswered invites count toward the same cap. Otherwise a 429 would appear only for
  // unknown emails (which add invites, not requests) and reveal whether an account exists.
  const countPending = async (db: Pick<typeof prisma, "userConnection" | "connectionInvite">) => {
    const [requests, invites] = await Promise.all([
      db.userConnection.count({ where: { requesterId: userId, status: "PENDING" } }),
      db.connectionInvite.count({ where: { inviterId: userId, acceptedAt: null } }),
    ]);
    return requests + invites;
  };

  // Checked before the lookup, so it applies the same way to every email.
  // This early check is a cheap fast path; the authoritative one is re-run
  // under a lock below, because count-then-create alone isn't atomic.
  if ((await countPending(prisma)) >= MAX_PENDING_OUTGOING) return capped();

  // Daily limit on every valid send, known email or not, so a 429 never hints at whether
  // an account exists.
  if (!allowInvite(userId)) {
    return NextResponse.json(
      { error: "You've sent a lot of requests today. Please try again tomorrow." },
      { status: 429, headers: { "Retry-After": "86400" } },
    );
  }

  // Case-insensitive exact match. Not Prisma's `mode: "insensitive"`: on
  // Postgres that is ILIKE, so "%" or "_" in the input act as wildcards and
  // "%@gmail.com" would match an arbitrary account. LOWER() = $1 is a plain
  // equality on a bound parameter.
  const [target] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "users" WHERE LOWER("email") = ${email.toLowerCase()} LIMIT 1`;
  if (!target) {
    // DB work only inside the request; the email goes out after the response, so
    // response time can't reveal whether an account exists.
    const invitee = normalizeEmail(email);
    const inviterName = session.user.name ?? "";
    try {
      const claim = await recordInvite(invitee, userId, new Date());
      if (claim) after(() => deliverInvite(invitee, userId, inviterName, claim));
    } catch (err) {
      // A failure here must look like success, or a 500 would mark "no account".
      console.error("Recording invite failed", err instanceof Error ? err.message : err);
    }
    return neutralOk();
  }
  if (target.id === userId) {
    return NextResponse.json({ error: "You can't connect with yourself" }, { status: 400 });
  }

  try {
    const overCap = await prisma.$transaction(async (tx) => {
      // Serialise this user's sends. The lock is transaction-scoped, so it
      // is released on commit/rollback and is safe on a pooled connection.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"connreq:" + userId}))`;

      if ((await countPending(tx)) >= MAX_PENDING_OUTGOING) return true;

      // Any existing row, in either direction and in any status (PENDING,
      // ACCEPTED, DECLINED), means no new request. A DECLINED row is never
      // reset here, so the person who declined isn't asked again.
      const existing = await tx.userConnection.findFirst({
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
          await tx.userConnection.delete({ where: { id: existing.id } });
          await tx.userConnection.create({ data: { requesterId: userId, addresseeId: target.id } });
        }
        return false;
      }
      await tx.userConnection.create({ data: { requesterId: userId, addresseeId: target.id } });
      return false;
    });
    if (overCap) return capped();
  } catch (err) {
    // A concurrent identical request won the race: same outcome.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  return neutralOk();
}
