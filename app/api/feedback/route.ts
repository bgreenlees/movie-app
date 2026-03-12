import { auth } from "@/lib/auth";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { message } = await req.json();
  if (!message?.trim()) {
    return Response.json({ error: "Message required" }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from: "Movie App <onboarding@resend.dev>",
    to: "bobgreenlees@gmail.com",
    subject: "Feature Request",
    text: `From: ${session.user.name} (${session.user.email})\n\n${message}`,
  });

  if (error) {
    return Response.json({ error: "Failed to send" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
