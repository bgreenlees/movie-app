import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiGuard";
import { tmdb } from "@/lib/tmdb";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const providers = await tmdb.getAvailableProviders();
    return NextResponse.json({ providers });
  } catch (error) {
    console.error("Providers list error:", error);
    return NextResponse.json({ providers: [] });
  }
}
