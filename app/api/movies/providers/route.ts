import { NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

export async function GET() {
  try {
    const providers = await tmdb.getAvailableProviders();
    return NextResponse.json({ providers });
  } catch (error) {
    console.error("Providers list error:", error);
    return NextResponse.json({ providers: [] });
  }
}
