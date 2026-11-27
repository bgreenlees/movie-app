import { auth } from "@/lib/auth";
import { MAX_FEEDBACK_LENGTH } from "@/lib/feedback";
import { createRateLimiter } from "@/lib/rateLimit";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// 5 messages per user per hour, so a signed-in user can't flood the inbox or use
// up Resend's daily quota (security audit F4). Per server instance; see lib/rateLimit.ts.
const allowFeedback = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const message: unknown = body?.message;
  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Message required" }, { status: 400 });
  }
  if (message.length > MAX_FEEDBACK_LENGTH) {
    return Response.json(
      { error: `Message must be at most ${MAX_FEEDBACK_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Recipient comes from the environment, not the public repo (audit F12).
  const to = process.env.FEEDBACK_TO;
  if (!to) {
    console.error("FEEDBACK_TO is not set");
    return Response.json({ error: "Feedback is not configured" }, { status: 500 });
  }

  if (!allowFeedback(session.user.id)) {
    return Response.json(
      { error: "Too many messages. Please try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  const { error } = await resend.emails.send({
    from: "Movie App <onboarding@resend.dev>",
    to,
    subject: "Feature Request",
    text: `From: ${session.user.name} (${session.user.email})\n\n${message}`,
  });

  if (error) {
    return Response.json({ error: "Failed to send" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
