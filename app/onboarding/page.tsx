"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ONBOARDING_CLUSTERS as CLUSTERS } from "@/lib/onboarding";

// Poster paths curated from TMDB — fetched client-side
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

export default function OnboardingPage() {
  const { status } = useSession();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [posters, setPosters] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth guard + onboarding guard
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/user")
        .then((r) => r.json())
        .then((d) => {
          if (d.hasCompletedOnboarding) router.push("/search");
        });
    }
  }, [status, router]);

  // Fetch all poster paths in one call
  useEffect(() => {
    fetch("/api/onboarding/movies")
      .then((r) => r.json())
      .then((data) => {
        const map: Record<number, string> = {};
        for (const [id, info] of Object.entries(data.movies as Record<string, { posterPath: string | null }>)) {
          if (info.posterPath) map[Number(id)] = info.posterPath;
        }
        setPosters(map);
      });
  }, []);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 5) {
        next.add(id);
      }
      return next;
    });
  };

  const submit = async (skipped: boolean) => {
    setIsSubmitting(true);
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieIds: skipped ? [] : Array.from(selected), skipped }),
      });
      router.push("/search");
    } catch {
      setIsSubmitting(false);
    }
  };

  if (status === "loading" || status === "unauthenticated") return null;

  const count = selected.size;
  const canSubmit = count >= 3 && count <= 5;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b" style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--border)" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--primary)" }}>
              What films do you love?
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              Pick 3 to 5 films you love and we’ll suggest more like them
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="text-sm font-semibold px-3 py-1 rounded-full"
              style={{
                backgroundColor: canSubmit ? "color-mix(in srgb, var(--accent) 20%, transparent)" : "var(--border)",
                color: canSubmit ? "var(--color-accent-text)" : "var(--text-muted)",
              }}
            >
              {count} / 5 selected
            </span>
            <button
              onClick={() => submit(false)}
              disabled={!canSubmit || isSubmitting}
              className="px-5 py-2 text-sm font-semibold text-white rounded-md transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {isSubmitting ? "Saving…" : "Let's Go →"}
            </button>
            <button
              onClick={() => submit(true)}
              disabled={isSubmitting}
              className="text-sm hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>

      {/* Clusters */}
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10 flex-1">
        {CLUSTERS.map((cluster) => (
          <div key={cluster.label}>
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
              {cluster.label}
            </h2>
            <div className="grid grid-cols-5 gap-3">
              {cluster.movies.map((movie) => {
                const isSelected = selected.has(movie.id);
                const posterPath = posters[movie.id];
                return (
                  <button
                    key={movie.id}
                    onClick={() => toggle(movie.id)}
                    disabled={!isSelected && count >= 5}
                    className="relative rounded-lg overflow-hidden group transition-all duration-200"
                    style={{
                      boxShadow: isSelected ? `0 0 0 3px var(--accent), 0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)` : "none",
                      opacity: !isSelected && count >= 5 ? 0.4 : 1,
                    }}
                    title={movie.title}
                  >
                    <div className="aspect-[2/3] relative" style={{ backgroundColor: "var(--border)" }}>
                      {posterPath ? (
                        <Image
                          src={`${POSTER_BASE}${posterPath}`}
                          alt={movie.title}
                          fill
                          className="object-cover"
                          sizes="(max-width: 1200px) 20vw, 220px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-center px-2" style={{ color: "var(--text-muted)" }}>
                          {movie.title}
                        </div>
                      )}

                      {/* Selected overlay */}
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}>
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl" style={{ backgroundColor: "var(--accent)" }}>
                            ✓
                          </div>
                        </div>
                      )}

                      {/* Hover overlay for unselected */}
                      {!isSelected && (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-end p-2" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
                          <span className="text-white text-xs font-medium leading-tight">{movie.title}</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
