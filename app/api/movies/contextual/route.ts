import { NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

const TIME_SLOTS = [
  { label: "Late Night", hours: [0, 1, 2, 3, 4, 5], genres: [27, 9648, 80] },      // Horror, Mystery, Crime
  { label: "Morning",    hours: [6, 7, 8, 9, 10, 11], genres: [35, 18, 10749] },    // Comedy, Drama, Romance
  { label: "Afternoon",  hours: [12, 13, 14, 15, 16, 17], genres: [12, 10751, 16] },// Adventure, Family, Animation
  { label: "Evening",    hours: [18, 19, 20, 21, 22, 23], genres: [28, 878, 53] },  // Action, Sci-Fi, Thriller
];

export async function GET() {
  const hour = new Date().getUTCHours();
  const slot = TIME_SLOTS.find((s) => s.hours.includes(hour)) ?? TIME_SLOTS[3];

  try {
    const data = await tmdb.getByGenre(slot.genres);
    const results = (data.results || []).filter((m) => m.poster_path);
    return NextResponse.json({ results, timeSlot: slot.label });
  } catch {
    return NextResponse.json({ results: [], timeSlot: slot.label });
  }
}
