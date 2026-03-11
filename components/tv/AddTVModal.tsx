"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import ThumbRating from "@/components/ui/ThumbRating";
import toast from "react-hot-toast";
import type { TMDBWatchProvider } from "@/lib/tmdb";

interface ExistingTVEntry {
  id: string;
  status: string;
  platform?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

interface AddTVModalProps {
  isOpen: boolean;
  onClose: () => void;
  tvShowId: number;
  tvShowName: string;
  existingEntry?: ExistingTVEntry;
  onSuccess?: () => void;
}

export default function AddTVModal({
  isOpen,
  onClose,
  tvShowId,
  tvShowName,
  existingEntry,
  onSuccess,
}: AddTVModalProps) {
  const [providers, setProviders] = useState<{ flatrate: TMDBWatchProvider[]; rent: TMDBWatchProvider[] }>({ flatrate: [], rent: [] });
  const [userServices, setUserServices] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState({
    status: "WANT_TO_WATCH",
    platform: "",
    rating: 0,
    review: "",
    currentSeason: "",
    currentEpisode: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && tvShowId) {
      Promise.all([
        fetch(`/api/tv/${tvShowId}/providers`).then((r) => r.json()),
        fetch("/api/user/streaming").then((r) => r.json()),
      ])
        .then(([providerData, userData]) => {
          setProviders({ flatrate: providerData.flatrate || [], rent: providerData.rent || [] });
          setUserServices(new Set(userData.streamingServices || []));
        })
        .catch(() => {
          setProviders({ flatrate: [], rent: [] });
          setUserServices(new Set());
        });
    }
  }, [isOpen, tvShowId]);

  useEffect(() => {
    if (isOpen) {
      if (existingEntry) {
        setFormData({
          status: existingEntry.status,
          platform: existingEntry.platform || "",
          rating: existingEntry.rating || 0,
          review: existingEntry.review || "",
          currentSeason: existingEntry.currentSeason ? String(existingEntry.currentSeason) : "",
          currentEpisode: existingEntry.currentEpisode ? String(existingEntry.currentEpisode) : "",
        });
      } else {
        setFormData({ status: "WANT_TO_WATCH", platform: "", rating: 0, review: "", currentSeason: "", currentEpisode: "" });
      }
    }
  }, [isOpen, existingEntry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (formData.status === "REMOVE" && existingEntry) {
        const res = await fetch(`/api/tv/watchlist/${existingEntry.id}`, { method: "DELETE" });
        if (!res.ok) {
          toast.error("Failed to remove show");
          return;
        }
        toast.success("Removed from lists!");
        onSuccess?.();
        onClose();
        return;
      }

      const body = {
        tvShowId,
        status: formData.status,
        platform: formData.platform || null,
        rating: formData.rating || null,
        review: formData.review || null,
        currentSeason: formData.currentSeason ? parseInt(formData.currentSeason) : null,
        currentEpisode: formData.currentEpisode ? parseInt(formData.currentEpisode) : null,
      };

      if (existingEntry) {
        const res = await fetch(`/api/tv/watchlist/${existingEntry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { toast.error("Failed to update"); return; }
        toast.success("Updated!");
      } else {
        const res = await fetch("/api/tv/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) { toast.error("Failed to add show"); return; }
        toast.success("Added to TV list!");
      }

      onSuccess?.();
      onClose();
    } catch {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isRemove = formData.status === "REMOVE";
  const isWatching = formData.status === "WATCHING";

  const statusOptions = [
    { value: "WANT_TO_WATCH", label: "Want to Watch" },
    { value: "WATCHING", label: "Watching" },
    { value: "WATCHED", label: "Finished" },
    ...(existingEntry ? [{ value: "REMOVE", label: "Remove" }] : []),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={existingEntry ? `Update "${tvShowName}"` : `Add "${tvShowName}"`}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Status */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Status</label>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(({ value, label }) => {
              const active = formData.status === value;
              const isRed = value === "REMOVE";
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData({ ...formData, status: value })}
                  className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                  style={{
                    backgroundColor: active ? (isRed ? "#ef4444" : "var(--accent)") : "var(--border)",
                    color: active ? "white" : "var(--foreground)",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Current progress — shown when status is Watching */}
        {isWatching && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              Where are you up to?
            </label>
            <div className="flex gap-3 items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm shrink-0" style={{ color: "var(--foreground)" }}>Season</label>
                <input
                  type="number"
                  min="1"
                  value={formData.currentSeason}
                  onChange={(e) => setFormData({ ...formData, currentSeason: e.target.value })}
                  className="w-16 px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
                  placeholder="1"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm shrink-0" style={{ color: "var(--foreground)" }}>Episode</label>
                <input
                  type="number"
                  min="1"
                  value={formData.currentEpisode}
                  onChange={(e) => setFormData({ ...formData, currentEpisode: e.target.value })}
                  className="w-16 px-2 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-1"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
                  placeholder="1"
                />
              </div>
            </div>
          </div>
        )}

        {/* Streaming availability */}
        {!isRemove && (providers.flatrate.length > 0 || providers.rent.length > 0) && (
          <div>
            {providers.flatrate.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>Stream</p>
                <div className="flex flex-wrap gap-2">
                  {providers.flatrate.map((p) => {
                    const have = userServices.has(p.provider_id);
                    return (
                      <div key={p.provider_id} className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                        style={{ backgroundColor: have ? "color-mix(in srgb, var(--accent) 12%, var(--card-bg))" : "transparent", border: `1px solid ${have ? "var(--accent)" : "transparent"}` }}
                        title={p.provider_name}
                      >
                        <div className="relative">
                          <Image src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} width={20} height={20} className="rounded" />
                          {have && <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: "var(--accent)", fontSize: "8px" }}>✓</div>}
                        </div>
                        <span className="text-xs" style={{ color: have ? "var(--accent)" : "var(--foreground)", fontWeight: have ? 600 : 400 }}>{p.provider_name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rating + Review */}
        {!isRemove && (
          <>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Details</span>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
            </div>

            <div className="flex gap-4 items-start">
              <div style={{ width: "220px", flexShrink: 0 }}>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Rating (optional)</label>
                <ThumbRating rating={formData.rating} onChange={(rating) => setFormData({ ...formData, rating })} />
              </div>
              <div className="flex-1" style={{ marginRight: "1.5rem" }}>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Review (optional)</label>
                <textarea
                  value={formData.review}
                  onChange={(e) => setFormData({ ...formData, review: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 resize-y text-sm"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
                  placeholder="Share your thoughts (optional)"
                  maxLength={2000}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Platform (optional)</label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                className="px-3 py-2 border rounded-md focus:outline-none focus:ring-1 appearance-none text-sm"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
              >
                <option value="">Select platform</option>
                <option value="Netflix">Netflix</option>
                <option value="Amazon Prime">Amazon Prime</option>
                <option value="Disney+">Disney+</option>
                <option value="Hulu">Hulu</option>
                <option value="Apple TV+">Apple TV+</option>
                <option value="HBO Max">HBO Max</option>
                <option value="Paramount+">Paramount+</option>
              </select>
            </div>
          </>
        )}

        <div className="flex gap-3 justify-end pt-4">
          <button type="button" onClick={onClose} disabled={isSubmitting}
            className="px-6 py-2 border rounded-md transition-colors disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting}
            className="px-6 py-2 text-white rounded-md transition-colors disabled:opacity-50"
            style={{ backgroundColor: isRemove ? "#ef4444" : "var(--accent)" }}
          >
            {isSubmitting ? "Saving..." : isRemove ? "Remove" : existingEntry ? "Update" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
