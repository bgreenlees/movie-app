import { Resend } from "resend";
import { prisma } from "./db";
import { normalizeEmail } from "./emailAddress";

export const SITE_URL = "https://whatsupnext.site";
/** Don't email the same address from the same inviter more often than this. */
export const RESEND_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

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
    subject: line,
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

/**
 * Records an invite from `inviterId` to `email` (already normalised) and emails it,
 * unless the same inviter already emailed that address within RESEND_COOLDOWN_MS.
 * The claim on `sentAt` happens under the caller's per-user lock; the email is sent
 * after, and the claim is rolled back if sending fails, so a later try can resend.
 */
export async function createInvite(email: string, inviterId: string, inviterName: string, now = new Date()) {
  const claim = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"connreq:" + inviterId}))`;
    const existing = await tx.connectionInvite.findUnique({
      where: { inviterId_email: { inviterId, email } },
    });
    if (existing?.acceptedAt) return null;
    if (existing?.sentAt && now.getTime() - existing.sentAt.getTime() < RESEND_COOLDOWN_MS) return null;
    await tx.connectionInvite.upsert({
      where: { inviterId_email: { inviterId, email } },
      create: { inviterId, email, sentAt: now },
      update: { sentAt: now },
    });
    return { previousSentAt: existing?.sentAt ?? null };
  });
  if (!claim) return;

  if (!(await sendInviteEmail(email, inviterName))) {
    await prisma.connectionInvite.update({
      where: { inviterId_email: { inviterId, email } },
      data: { sentAt: claim.previousSentAt },
    });
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
    }
  } catch (err) {
    console.error("Converting invites failed", err instanceof Error ? err.message : err);
  }
}
