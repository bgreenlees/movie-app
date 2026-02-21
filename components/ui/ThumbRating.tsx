"use client";

interface ThumbRatingProps {
  rating: number; // 0 = none, 1 = didn't like, 2 = like, 3 = love
  onChange: (rating: number) => void;
  showLabels?: boolean;
}

const RATINGS = [
  { value: 1, icon: "👎", label: "Didn't like" },
  { value: 2, icon: "👍", label: "Like" },
  { value: 3, icon: "❤️", label: "Love" },
];

export default function ThumbRating({ rating, onChange, showLabels = true }: ThumbRatingProps) {
  return (
    <div className="flex gap-1.5 w-full">
      {RATINGS.map(({ value, icon, label }) => {
        const isSelected = rating === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(isSelected ? 0 : value)}
            className="flex flex-col items-center gap-1 flex-1 py-2 rounded-lg border-2 transition-all hover:opacity-80"
            style={{
              borderColor: isSelected ? "var(--accent)" : "var(--border)",
              backgroundColor: isSelected
                ? "color-mix(in srgb, var(--accent) 12%, var(--card-bg))"
                : "transparent",
            }}
            aria-label={label}
            title={label}
          >
            <span className="text-xl leading-none">{icon}</span>
            {showLabels && (
              <span
                className="text-xs leading-none"
                style={{ color: isSelected ? "var(--accent)" : "var(--text-muted)" }}
              >
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ratingIcon(rating: number | null | undefined): string | null {
  if (!rating) return null;
  if (rating === 1) return "👎";
  if (rating === 2) return "👍";
  if (rating === 3) return "❤️";
  return null;
}

export function ratingLabel(rating: number | null | undefined): string | null {
  if (!rating) return null;
  if (rating === 1) return "Didn't like";
  if (rating === 2) return "Like";
  if (rating === 3) return "Love";
  return null;
}
