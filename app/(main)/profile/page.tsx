"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import type { TMDBWatchProvider } from "@/lib/tmdb";

export default function ProfilePage() {
  const [allProviders, setAllProviders] = useState<TMDBWatchProvider[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [providersRes, userRes] = await Promise.all([
        fetch("/api/movies/providers"),
        fetch("/api/user/streaming"),
      ]);

      if (providersRes.ok) {
        const data = await providersRes.json();
        setAllProviders(data.providers || []);
      }

      if (userRes.ok) {
        const data = await userRes.json();
        setSelected(new Set(data.streamingServices || []));
      }

      setIsLoading(false);
    };

    load();
  }, []);

  const toggle = async (providerId: number) => {
    const next = new Set(selected);
    if (next.has(providerId)) {
      next.delete(providerId);
    } else {
      next.add(providerId);
    }
    setSelected(next);

    setIsSaving(true);
    try {
      const res = await fetch("/api/user/streaming", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamingServices: Array.from(next) }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save: ${message}`);
      setSelected(selected);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
        Profile
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        Select the streaming services you subscribe to. We'll highlight them when adding movies.
      </p>

      <h2 className="text-base font-semibold mb-4" style={{ color: "var(--foreground)" }}>
        My Streaming Services
        {isSaving && <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>Saving...</span>}
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {allProviders.map((provider) => {
          const isSelected = selected.has(provider.provider_id);
          return (
            <button
              key={provider.provider_id}
              onClick={() => toggle(provider.provider_id)}
              className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all"
              style={{
                borderColor: isSelected ? "var(--accent)" : "var(--border)",
                backgroundColor: isSelected ? "color-mix(in srgb, var(--accent) 10%, var(--card-bg))" : "var(--card-bg)",
              }}
            >
              <div className="relative">
                <Image
                  src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                  alt={provider.provider_name}
                  width={48}
                  height={48}
                  className="rounded-lg"
                />
                {isSelected && (
                  <div
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    ✓
                  </div>
                )}
              </div>
              <span className="text-xs text-center font-medium leading-tight" style={{ color: "var(--foreground)" }}>
                {provider.provider_name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
