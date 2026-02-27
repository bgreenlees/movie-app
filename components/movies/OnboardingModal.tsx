"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const CLUSTERS: { label: string; movies: { id: number; title: string }[] }[] = [
  {
    label: "Mind & Intellect",
    movies: [
      { id: 37799,  title: "The Social Network" },
      { id: 244786, title: "Whiplash" },
      { id: 205596, title: "The Imitation Game" },
      { id: 60308,  title: "Moneyball" },
      { id: 453,    title: "A Beautiful Mind" },
    ],
  },
  {
    label: "Action & Epic",
    movies: [
      { id: 155,    title: "The Dark Knight" },
      { id: 27205,  title: "Inception" },
      { id: 76341,  title: "Mad Max: Fury Road" },
      { id: 98,     title: "Gladiator" },
      { id: 245891, title: "John Wick" },
    ],
  },
  {
    label: "Sci-Fi",
    movies: [
      { id: 603,    title: "The Matrix" },
      { id: 157336, title: "Interstellar" },
      { id: 329865, title: "Arrival" },
      { id: 264644, title: "Ex Machina" },
      { id: 335984, title: "Blade Runner 2049" },
    ],
  },
  {
    label: "Heartwarming Classics",
    movies: [
      { id: 278,  title: "The Shawshank Redemption" },
      { id: 13,   title: "Forrest Gump" },
      { id: 489,  title: "Good Will Hunting" },
      { id: 8358, title: "Cast Away" },
      { id: 497,  title: "The Green Mile" },
    ],
  },
  {
    label: "Comedy & Fun",
    movies: [
      { id: 120467, title: "The Grand Budapest Hotel" },
      { id: 546554, title: "Knives Out" },
      { id: 8363,   title: "Superbad" },
      { id: 445571, title: "Game Night" },
      { id: 55721,  title: "Bridesmaids" },
    ],
  },
  {
    label: "Animation",
    movies: [
      { id: 862,    title: "Toy Story" },
      { id: 129,    title: "Spirited Away" },
      { id: 354912, title: "Coco" },
      { id: 420818, title: "The Lion King" },
      { id: 12,     title: "Finding Nemo" },
    ],
  },
  {
    label: "Thriller & Horror",
    movies: [
      { id: 419430, title: "Get Out" },
      { id: 496243, title: "Parasite" },
      { id: 274,    title: "The Silence of the Lambs" },
      { id: 447332, title: "A Quiet Place" },
      { id: 493922, title: "Hereditary" },
    ],
  },
  {
    label: "Romance & Drama",
    movies: [
      { id: 313369, title: "La La Land" },
      { id: 597,    title: "Titanic" },
      { id: 11036,  title: "The Notebook" },
      { id: 122906, title: "About Time" },
      { id: 4348,   title: "Pride & Prejudice" },
    ],
  },
];

const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

interface OnboardingModalProps {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [posters, setPosters] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding/movies")
      .then((r) => r.json())
      .then((data) => {
        const map: Record<number, string> = {};
        for (const [id, info] of Object.entries(
          data.movies as Record<string, { posterPath: string | null }>
        )) {
          if (info.posterPath) map[Number(id)] = info.posterPath;
        }
        setPosters(map);
      });
  }, []);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
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
      onClose();
    } catch {
      setIsSubmitting(false);
    }
  };

  const count = selected.size;
  const canSubmit = count >= 3 && count <= 5;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
    >
      {/* Sticky header */}
      <div
        className="flex-shrink-0 border-b"
        style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--primary)" }}>
              What films do you love?
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              Pick 3–5 to calibrate your Discover feed
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className="text-sm font-semibold px-3 py-1 rounded-full"
              style={{
                backgroundColor: canSubmit
                  ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                  : "var(--border)",
                color: canSubmit ? "var(--accent)" : "var(--text-muted)",
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

      {/* Scrollable cluster grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
          {CLUSTERS.map((cluster) => (
            <div key={cluster.label}>
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                {cluster.label}
              </h2>
              <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
                {cluster.movies.map((movie) => {
                  const isSelected = selected.has(movie.id);
                  const posterPath = posters[movie.id];
                  return (
                    <button
                      key={movie.id}
                      onClick={() => toggle(movie.id)}
                      disabled={!isSelected && count >= 5}
                      className="relative rounded-lg overflow-hidden group transition-all duration-200 focus:outline-none"
                      style={{
                        boxShadow: isSelected
                          ? `0 0 0 3px var(--accent), 0 0 24px color-mix(in srgb, var(--accent) 50%, transparent)`
                          : "none",
                        opacity: !isSelected && count >= 5 ? 0.35 : 1,
                        transform: isSelected ? "scale(1.03)" : "scale(1)",
                        transition: "transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease",
                      }}
                      title={movie.title}
                    >
                      <div
                        className="aspect-[2/3] relative"
                        style={{ backgroundColor: "var(--border)" }}
                      >
                        {posterPath ? (
                          <Image
                            src={`${POSTER_BASE}${posterPath}`}
                            alt={movie.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 1200px) 20vw, 240px"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center text-xs text-center px-2"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {movie.title}
                          </div>
                        )}

                        {/* Selected overlay */}
                        {isSelected && (
                          <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{
                              backgroundColor: "color-mix(in srgb, var(--accent) 35%, transparent)",
                            }}
                          >
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl"
                              style={{ backgroundColor: "var(--accent)" }}
                            >
                              ✓
                            </div>
                          </div>
                        )}

                        {/* Hover overlay */}
                        {!isSelected && (
                          <div
                            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"
                            style={{
                              background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)",
                            }}
                          >
                            <span className="text-white text-xs font-medium leading-tight">
                              {movie.title}
                            </span>
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
    </div>
  );
}
