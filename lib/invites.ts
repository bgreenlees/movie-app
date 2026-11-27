import { Resend } from "resend";
import { prisma } from "./db";
import { normalizeEmail } from "./emailAddress";

export const SITE_URL = "https://whatsupnext.site";
/** Don't email the same address from the same inviter more often than this. */
export const RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Most new invites one user may create per rolling 24 hours (durable, unlike the in-memory limiter). */
export const MAX_INVITES_PER_DAY = 10;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Fixed copy. The inviter's name is the only user-supplied text, and it is escaped in the HTML. */
export function buildInviteEmail(inviterName: string) {
  const name = inviterName.trim().slice(0, 100) || "A friend";
  const line = `${name} wants to share what to watch with you on What's Up Next`;
  return {
    // Fixed subject: the inviter's name only appears (escaped) in the body.
    subject: "You're invited to What's Up Next",
    text: `${line}\n\nJoin them: ${SITE_URL}\n`,
    html: `<p>${escapeHtml(line)}</p><p><a href="${SITE_URL}">Join What's Up Next</a></p>`,
  };
}

/** Sends one invite. Returns false (and logs) if email isn't configured or Resend fails. */
export async function sendInviteEmail(to: string, inviterName: string): Promise<boolean> {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    console.warn("EMAIL_FROM is not set: invite recorded but not emailed");
    return false;
  }
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not set: invite recorded but not emailed");
    return false;
  }
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from,
      to,
      ...buildInviteEmail(inviterName),
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (err) {
    console.error("Invite email failed", err instanceof Error ? err.message : err);
    return false;
  }
}

export type InviteClaim = { previousSentAt: Date | null };

/**
 * Step 1, inside the request (DB only, no network): records an invite from `inviterId` to
 * `email` (already normalised) unless the same inviter already emailed that address within
 * RESEND_COOLDOWN_MS, or already created MAX_INVITES_PER_DAY invites in the last 24h (then it
 * silently skips: the route still answers the neutral 200, which is what a known email gets,
 * so the cap can't reveal whether an account exists). Returns a claim when an email should be sent, else null. Runs under
 * the per-user lock, like the known-account path, so the two take comparable time.
 */
export async function recordInvite(
  email: string,
  inviterId: string,
  now = new Date(),
): Promise<InviteClaim | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"connreq:" + inviterId}))`;
    const existing = await tx.connectionInvite.findUnique({
      where: { inviterId_email: { inviterId, email } },
    });
    if (existing?.acceptedAt) return null;
    if (existing?.sentAt && now.getTime() - existing.sentAt.getTime() < RESEND_COOLDOWN_MS) return null;
    if (!existing) {
      const recent = await tx.connectionInvite.count({
        where: { inviterId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
      });
      if (recent >= MAX_INVITES_PER_DAY) return null;
    }
    await tx.connectionInvite.upsert({
      where: { inviterId_email: { inviterId, email } },
      create: { inviterId, email, sentAt: now },
      update: { sentAt: now },
    });
    return { previousSentAt: existing?.sentAt ?? null };
  });
}

/**
 * Step 2, run after the response is sent (`after()`): emails the invite and, if sending
 * fails, rolls the claim back so a later try can resend. Never throws.
 */
export async function deliverInvite(
  email: string,
  inviterId: string,
  inviterName: string,
  claim: InviteClaim,
): Promise<void> {
  try {
    if (await sendInviteEmail(email, inviterName)) return;
    await prisma.connectionInvite.update({
      where: { inviterId_email: { inviterId, email } },
      data: { sentAt: claim.previousSentAt },
    });
  } catch (err) {
    console.error("Delivering invite failed", err instanceof Error ? err.message : err);
  }
}

/**
 * On sign-in: turn every open invite for this email into a PENDING request from the
 * inviter, and mark it accepted. Safe to run on every sign-in (acceptedAt makes it
 * idempotent) and it never throws, so it can't block sign-in.
 */
export async function convertInvites(userId: string, email: string): Promise<void> {
  try {
    const lower = normalizeEmail(email);
    // Exact equality on a bound parameter (not ILIKE, so % and _ aren't wildcards).
    const invites = await prisma.$queryRaw<{ id: string; inviter_id: string }[]>`
      SELECT "id", "inviter_id" FROM "connection_invites"
      WHERE "email" = ${lower} AND "accepted_at" IS NULL`;
    for (const invite of invites) {
      // Per invite, so one conflict (e.g. a concurrent sign-in made the same request)
      // doesn't skip the rest.
      try {
        await prisma.$transaction(async (tx) => {
          if (invite.inviter_id !== userId) {
            const existing = await tx.userConnection.findFirst({
              where: {
                OR: [
                  { requesterId: invite.inviter_id, addresseeId: userId },
                  { requesterId: userId, addresseeId: invite.inviter_id },
                ],
              },
              select: { id: true },
            });
            if (!existing) {
              await tx.userConnection.create({ data: { requesterId: invite.inviter_id, addresseeId: userId } });
            }
          }
          await tx.connectionInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
        });
      } catch (err) {
        console.error("Converting one invite failed", err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("Converting invites failed", err instanceof Error ? err.message : err);
  }
}
