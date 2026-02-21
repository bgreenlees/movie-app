"use client";

import { useState } from "react";

interface StarRatingProps {
  rating: number;
  onChange: (rating: number) => void;
}

export default function StarRating({ rating, onChange }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const displayRating = hoverRating || rating;

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHoverRating(star)}
          onMouseLeave={() => setHoverRating(0)}
          className="text-3xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 rounded"
          style={{
            color: star <= displayRating ? "var(--accent)" : "var(--border)",
            focusRingColor: "var(--accent)",
          }}
          aria-label={`Rate ${star} star${star > 1 ? "s" : ""}`}
        >
          {star <= displayRating ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}
