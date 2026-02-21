"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Modal from "@/components/ui/Modal";
import ThumbRating from "@/components/ui/ThumbRating";
import toast from "react-hot-toast";
import type { TMDBWatchProvider } from "@/lib/tmdb";

interface ExistingEntry {
  id: string;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
}

interface AddMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieId: number;
  movieTitle: string;
  existingEntry?: ExistingEntry;
  onSuccess?: () => void;
}

export default function AddMovieModal({
  isOpen,
  onClose,
  movieId,
  movieTitle,
  existingEntry,
  onSuccess,
}: AddMovieModalProps) {
  const [providers, setProviders] = useState<{ flatrate: TMDBWatchProvider[]; rent: TMDBWatchProvider[] }>({ flatrate: [], rent: [] });
  const [userServices, setUserServices] = useState<Set<number>>(new Set());

  const [formData, setFormData] = useState({
    status: "WANT_TO_WATCH",
    platform: "",
    watchType: "",
    rating: 0,
    review: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && movieId) {
      Promise.all([
        fetch(`/api/movies/${movieId}/providers`).then((r) => r.json()),
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
  }, [isOpen, movieId]);

  useEffect(() => {
    if (isOpen) {
      if (existingEntry) {
        setFormData({
          status: existingEntry.status,
          platform: existingEntry.platform || "",
          watchType: existingEntry.watchType || "",
          rating: existingEntry.rating || 0,
          review: existingEntry.review || "",
        });
      } else {
        setFormData({
          status: "WANT_TO_WATCH",
          platform: "",
          watchType: "",
          rating: 0,
          review: "",
        });
      }
    }
  }, [isOpen, existingEntry]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Remove from lists
      if (formData.status === "REMOVE" && existingEntry) {
        const response = await fetch(`/api/watchlist/${existingEntry.id}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const data = await response.json();
          toast.error(data.error || "Failed to remove movie");
          setIsSubmitting(false);
          return;
        }

        toast.success("Removed from lists!");
        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      // Update existing entry
      if (existingEntry) {
        const response = await fetch(`/api/watchlist/${existingEntry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: formData.status,
            platform: formData.platform || null,
            watchType: formData.watchType || null,
            rating: formData.rating || null,
            review: formData.review || null,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          toast.error(data.error || "Failed to update movie");
          setIsSubmitting(false);
          return;
        }

        toast.success("Updated!");
        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      // Add new entry
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieId,
          status: formData.status,
          platform: formData.platform || null,
          watchType: formData.watchType || null,
          rating: formData.rating || null,
          review: formData.review || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Failed to add movie");
        setIsSubmitting(false);
        return;
      }

      toast.success("Added to watchlist!");
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  const isRemove = formData.status === "REMOVE";

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={existingEntry ? `Update "${movieTitle}"` : `Add "${movieTitle}"`}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Status */}
        <div>
          <label className="block text-sm font-medium mb-2">Status</label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="status"
                value="WANT_TO_WATCH"
                checked={formData.status === "WANT_TO_WATCH"}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="mr-2"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-sm">Want to Watch</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="status"
                value="WATCHED"
                checked={formData.status === "WATCHED"}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
                className="mr-2"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-sm">Watched</span>
            </label>
            {existingEntry && (
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value="REMOVE"
                  checked={formData.status === "REMOVE"}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                  className="mr-2"
                  style={{ accentColor: "#ef4444" }}
                />
                <span className="text-sm text-red-500">Remove from Lists</span>
              </label>
            )}
          </div>
        </div>

        {/* Streaming availability */}
        {!isRemove && (providers.flatrate.length > 0 || providers.rent.length > 0) && (
          <div>
            {providers.flatrate.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Stream
                </p>
                <div className="flex flex-wrap gap-2">
                  {providers.flatrate.map((p) => {
                    const have = userServices.has(p.provider_id);
                    return (
                      <div
                        key={p.provider_id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                        style={{
                          backgroundColor: have ? "color-mix(in srgb, var(--accent) 12%, var(--card-bg))" : "transparent",
                          border: `1px solid ${have ? "var(--accent)" : "transparent"}`,
                        }}
                        title={p.provider_name}
                      >
                        <div className="relative">
                          <Image
                            src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                            alt={p.provider_name}
                            width={20}
                            height={20}
                            className="rounded"
                          />
                          {have && (
                            <div
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"
                              style={{ backgroundColor: "var(--accent)", fontSize: "8px" }}
                            >
                              ✓
                            </div>
                          )}
                        </div>
                        <span className="text-xs" style={{ color: have ? "var(--accent)" : "var(--foreground)", fontWeight: have ? 600 : 400 }}>
                          {p.provider_name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {providers.rent.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Rent / Buy
                </p>
                <div className="flex flex-wrap gap-2">
                  {providers.rent.map((p) => {
                    const have = userServices.has(p.provider_id);
                    return (
                      <div
                        key={p.provider_id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                        style={{
                          backgroundColor: have ? "color-mix(in srgb, var(--accent) 12%, var(--card-bg))" : "transparent",
                          border: `1px solid ${have ? "var(--accent)" : "transparent"}`,
                        }}
                        title={p.provider_name}
                      >
                        <div className="relative">
                          <Image
                            src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                            alt={p.provider_name}
                            width={20}
                            height={20}
                            className="rounded"
                          />
                          {have && (
                            <div
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"
                              style={{ backgroundColor: "var(--accent)", fontSize: "8px" }}
                            >
                              ✓
                            </div>
                          )}
                        </div>
                        <span className="text-xs" style={{ color: have ? "var(--accent)" : "var(--foreground)", fontWeight: have ? 600 : 400 }}>
                          {p.provider_name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rest of fields — hidden when removing */}
        {!isRemove && (
          <>
            {/* Watch details header */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Watch Details
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
            </div>

            {/* Platform */}
            <div>
              <label htmlFor="platform" className="block text-sm font-medium mb-2">
                Platform (optional)
              </label>
              <select
                id="platform"
                value={formData.platform}
                onChange={(e) =>
                  setFormData({ ...formData, platform: e.target.value })
                }
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2"
                style={{
                  borderColor: "var(--border)",

                }}
              >
                <option value="">Select platform (optional)</option>
                <option value="Netflix">Netflix</option>
                <option value="Amazon Prime">Amazon Prime</option>
                <option value="Disney+">Disney+</option>
                <option value="Hulu">Hulu</option>
                <option value="Apple TV+">Apple TV+</option>
                <option value="HBO Max">HBO Max</option>
                <option value="Paramount+">Paramount+</option>
              </select>
            </div>

            {/* Watch Type */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Watch Type (optional)
              </label>
              <div className="flex gap-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="watchType"
                    value=""
                    checked={formData.watchType === ""}
                    onChange={(e) =>
                      setFormData({ ...formData, watchType: e.target.value })
                    }
                    className="mr-2"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-sm">None</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="watchType"
                    value="Rented"
                    checked={formData.watchType === "Rented"}
                    onChange={(e) =>
                      setFormData({ ...formData, watchType: e.target.value })
                    }
                    className="mr-2"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-sm">Rented</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="watchType"
                    value="Purchased"
                    checked={formData.watchType === "Purchased"}
                    onChange={(e) =>
                      setFormData({ ...formData, watchType: e.target.value })
                    }
                    className="mr-2"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-sm">Purchased</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="watchType"
                    value="Subscription"
                    checked={formData.watchType === "Subscription"}
                    onChange={(e) =>
                      setFormData({ ...formData, watchType: e.target.value })
                    }
                    className="mr-2"
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span className="text-sm">Subscription</span>
                </label>
              </div>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Rating (optional)
              </label>
              <ThumbRating
                rating={formData.rating}
                onChange={(rating) => setFormData({ ...formData, rating })}
              />
            </div>

            {/* Review */}
            <div>
              <label htmlFor="review" className="block text-sm font-medium mb-2">
                Review (optional)
              </label>
              <textarea
                id="review"
                value={formData.review}
                onChange={(e) =>
                  setFormData({ ...formData, review: e.target.value })
                }
                rows={4}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 resize-y"
                style={{
                  borderColor: "var(--border)",

                }}
                placeholder="Share your thoughts about this movie (optional)"
                maxLength={2000}
              />
              <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                {formData.review.length}/2000 characters
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-6 py-2 border rounded-md transition-colors disabled:opacity-50"
            style={{
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 text-white rounded-md transition-colors disabled:opacity-50"
            style={{ backgroundColor: isRemove ? "#ef4444" : "var(--accent)" }}
          >
            {isSubmitting
              ? "Saving..."
              : isRemove
              ? "Remove"
              : existingEntry
              ? "Update"
              : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
