"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ONBOARDING_CLUSTERS as CLUSTERS } from "@/lib/onboarding";

const MIN_PICKS = 3;
const MAX_PICKS = 5;
const POSTER_BASE = "https://image.tmdb.org/t/p/w342";

interface OnboardingModalProps {
  onClose: () => void;
}

export default function OnboardingModal({ onClose }: OnboardingModalProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [posters, setPosters] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!selected.has(id) && selected.size >= MAX_PICKS) {
      setHint(`You can pick up to ${MAX_PICKS}. Tap one to remove it first.`);
      return;
    }
    setHint(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (skipped: boolean) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieIds: skipped ? [] : Array.from(selected), skipped }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onClose();
    } catch {
      setError("Couldn't save your picks. Check your connection and try again.");
      setIsSubmitting(false);
    }
  };

  // Escape closes the picker, the same as Skip (so the user isn't asked again).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void submit(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const count = selected.size;
  const canSubmit = count >= MIN_PICKS;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="flex-shrink-0 border-b"
        style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          <h1 id="onboarding-title" className="text-lg sm:text-xl font-bold" style={{ color: "var(--primary)" }}>
            What films do you love?
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Pick {MIN_PICKS} to {MAX_PICKS} films you love and we’ll suggest more like them.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 space-y-3">
          {CLUSTERS.map((cluster) => (
            <section key={cluster.label} aria-label={cluster.label}>
              <h2
                className="text-xs font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text-muted)" }}
              >
                {cluster.label}
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-x-2 gap-y-2 sm:gap-4">
                {cluster.movies.map((movie) => {
                  const isSelected = selected.has(movie.id);
                  const posterPath = posters[movie.id];
                  return (
                    <button
                      key={movie.id}
                      type="button"
                      onClick={() => toggle(movie.id)}
                      aria-pressed={isSelected}
                      className="text-left rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ outlineColor: "var(--accent)" }}
                    >
                      <div
                        className="aspect-[3/4] relative rounded-lg overflow-hidden"
                        style={{
                          backgroundColor: "var(--border)",
                          boxShadow: isSelected ? "0 0 0 3px var(--accent)" : "none",
                        }}
                      >
                        {posterPath && (
                          <Image
                            src={`${POSTER_BASE}${posterPath}`}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 33vw, (max-width: 768px) 25vw, 200px"
                          />
                        )}
                        {isSelected && (
                          <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ backgroundColor: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
                          >
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl"
                              style={{ backgroundColor: "var(--accent)" }}
                              aria-hidden="true"
                            >
                              ✓
                            </div>
                          </div>
                        )}
                      </div>
                      <span
                        className="block mt-1 text-[11px] sm:text-xs leading-tight line-clamp-2"
                        style={{ color: "var(--primary)" }}
                      >
                        {movie.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Sticky bottom bar: counter, hint/error, Continue, Skip */}
      <div
        className="flex-shrink-0 border-t"
        style={{ backgroundColor: "var(--card-bg)", borderColor: "var(--border)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
          {(hint || error) && (
            <p role="alert" className="text-sm mb-2" style={{ color: error ? "var(--danger, #f87171)" : "var(--text-muted)" }}>
              {error ?? hint}
            </p>
          )}
          <div className="flex items-center gap-3">
            <span
              className="text-sm font-semibold mr-auto"
              style={{ color: canSubmit ? "var(--color-accent-text)" : "var(--text-muted)" }}
              aria-live="polite"
            >
              {count} of {MAX_PICKS}{count < MIN_PICKS ? ` · pick ${MIN_PICKS - count} more` : ""}
            </span>
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={isSubmitting}
              className="min-h-11 px-4 text-sm hover:underline disabled:opacity-50"
              style={{ color: "var(--text-muted)" }}
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={!canSubmit || isSubmitting}
              className="min-h-11 px-6 text-sm font-semibold text-white rounded-md transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {isSubmitting ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
