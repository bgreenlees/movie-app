import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id as string },
    select: { streamingServices: true },
  });

  return NextResponse.json({ streamingServices: user?.streamingServices || [] });
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const streamingServices: number[] = body.streamingServices;

    if (!Array.isArray(streamingServices)) {
      return NextResponse.json({ error: "streamingServices must be an array" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { streamingServices: { set: streamingServices } },
      select: { streamingServices: true },
    });

    return NextResponse.json({ streamingServices: user.streamingServices });
  } catch (error) {
    console.error("Streaming PATCH error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
