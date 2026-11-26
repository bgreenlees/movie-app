"use client";

import type { MediaChoice, MoodSelection, TimeAvailable, Vibe } from "@/lib/moodPicker";

const MEDIA: { value: MediaChoice; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV" },
];

const VIBES: { value: Exclude<Vibe, "any">; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "heavy", label: "Heavy" },
  { value: "intense", label: "Intense" },
];

// One runtime limit for films and single episodes alike
const TIMES: { value: Exclude<TimeAvailable, "any">; label: string }[] = [
  { value: "30", label: "~30 min" },
  { value: "120", label: "Under 2 hrs" },
];

const TOGGLES: { key: "fresh" | "onMyServices"; label: string }[] = [
  { key: "fresh", label: "Something new" },
  { key: "onMyServices", label: "On my services" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors hover:opacity-80"
      style={
        active
          ? {
              backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--card-bg))",
              color: "var(--accent)",
              border: "1px solid var(--accent)",
            }
          : { color: "var(--foreground)", border: "1px solid var(--border)" }
      }
    >
      {children}
    </button>
  );
}

/** The Both / Movies / TV segmented control. */
export function MediaControl({
  value,
  onChange,
}: {
  value: MediaChoice;
  onChange: (media: MediaChoice) => void;
}) {
  return (
    <div
      className="flex rounded-lg overflow-hidden border"
      style={{ borderColor: "var(--border)" }}
      role="group"
      aria-label="Show movies, TV, or both"
    >
      {MEDIA.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          aria-pressed={value === m.value}
          className="px-4 py-1.5 text-sm font-medium cursor-pointer transition-colors"
          style={
            value === m.value
              ? { backgroundColor: "var(--accent)", color: "white" }
              : { color: "var(--text-muted)" }
          }
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

interface MoodControlsProps {
  value: MoodSelection;
  onChange: (next: MoodSelection) => void;
  /** Hide the Both / Movies / TV control. Pages that lay it out elsewhere (What to Watch puts it beside the title) pass this and render <MediaControl> themselves. */
  hideMedia?: boolean;
  /** Show the "Only services we both have" toggle (Watch Together). */
  showBothHave?: boolean;
  bothHave?: boolean;
  onBothHaveChange?: (bothHave: boolean) => void;
}

/** Mood chips (vibe, time) and toggles. Controlled: the parent owns the selection. */
export default function MoodControls({
  value,
  onChange,
  hideMedia = false,
  showBothHave = false,
  bothHave = false,
  onBothHaveChange,
}: MoodControlsProps) {
  const update = (patch: Partial<MoodSelection>) => onChange({ ...value, ...patch });

  return (
    <>
      {!hideMedia && (
        <div className="mb-3">
          <MediaControl value={value.media} onChange={(media) => update({ media })} />
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Moods">
        {VIBES.map((v) => (
          <Chip
            key={v.value}
            active={value.vibe === v.value}
            onClick={() => update({ vibe: value.vibe === v.value ? "any" : v.value })}
          >
            {v.label}
          </Chip>
        ))}
        {TIMES.map((t) => (
          <Chip
            key={t.value}
            active={value.time === t.value}
            onClick={() => update({ time: value.time === t.value ? "any" : t.value })}
          >
            {t.label}
          </Chip>
        ))}
        {TOGGLES.map((t) => (
          <Chip key={t.key} active={value[t.key]} onClick={() => update({ [t.key]: !value[t.key] })}>
            {t.label}
          </Chip>
        ))}
        {showBothHave && (
          <Chip active={bothHave} onClick={() => onBothHaveChange?.(!bothHave)}>
            Only services we both have
          </Chip>
        )}
      </div>
    </>
  );
}
