"use client";

interface ThumbRatingProps {
  rating: number; // 0 = none, 1 = didn't like, 2 = like, 3 = love
  onChange: (rating: number) => void;
  showLabels?: boolean;
  notInterested?: boolean;
  onNotInterested?: () => void;
}

const NOT_INTERESTED_PATH =
  "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

const THUMB_PATH = "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z";
const HEART_PATH = "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z";

const RATINGS = [
  { value: 1, label: "Didn't like", path: THUMB_PATH, flip: true },
  { value: 2, label: "Like",        path: THUMB_PATH, flip: false },
  { value: 3, label: "Love",        path: HEART_PATH, flip: false },
];

export default function ThumbRating({ rating, onChange, showLabels = true, notInterested, onNotInterested }: ThumbRatingProps) {
  return (
    <div className="flex gap-1.5 w-full">
      {onNotInterested && (
        <button
          type="button"
          onClick={onNotInterested}
          className="flex flex-col items-center gap-1 flex-1 py-2 rounded-lg transition-all hover:opacity-70"
          aria-label="Not interested"
          title="Not interested"
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6">
            {notInterested ? (
              <path d={NOT_INTERESTED_PATH} fill="#ffffff" />
            ) : (
              <path d={NOT_INTERESTED_PATH} fill="none" stroke="currentColor" strokeWidth="1" />
            )}
          </svg>
          {showLabels && (
            <span className="text-xs leading-none" style={{ color: "var(--text-muted)" }}>
              Not for me
            </span>
          )}
        </button>
      )}
      {RATINGS.map(({ value, label, path, flip }) => {
        const isSelected = rating === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(isSelected ? 0 : value)}
            className="flex flex-col items-center gap-1 flex-1 py-2 rounded-lg transition-all hover:opacity-70"
            aria-label={label}
            title={label}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              style={flip ? { transform: "rotate(180deg)" } : undefined}
            >
              {isSelected ? (
                <path d={path} fill="#ffffff" />
              ) : (
                <path d={path} fill="none" stroke="currentColor" strokeWidth="1" />
              )}
            </svg>
            {showLabels && (
              <span
                className="text-xs leading-none"
                style={{ color: "var(--text-muted)" }}
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
