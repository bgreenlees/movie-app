// The Overlap: two people as two circles; the amber spark where they overlap is
// what you'd both enjoy. Geometry is exact (issue #99): r = 16, centres 12.8 apart,
// in a 64x64 box. Flat colours only, the same on dark and light backgrounds.

export const LOGO_COLORS = { you: "#7C3AED", them: "#FB7185", spark: "#FBBF24" } as const;

const NAME = "What's Up Next";

// Lens between the two circles, drawn from the two arcs.
const LENS = "M32 17.34A16 16 0 0 1 32 46.66A16 16 0 0 1 32 17.34Z";
// Both circles as one path; with fill-rule="evenodd" the lens is cut away.
const KNOCKOUT =
  "M9.6 32a16 16 0 1 0 32 0a16 16 0 1 0-32 0ZM22.4 32a16 16 0 1 0 32 0a16 16 0 1 0-32 0Z";

export function LogoMark({
  size = 32,
  mono = false,
  decorative = false,
  className,
}: {
  size?: number;
  /** Single-colour version (inherits currentColor): only where one colour is required. */
  mono?: boolean;
  /** Hide from assistive tech when the name is already next to it (e.g. in <Logo />). */
  decorative?: boolean;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": NAME })}
    >
      {mono ? (
        <path d={KNOCKOUT} fill="currentColor" fillRule="evenodd" />
      ) : (
        <>
          <circle cx="25.6" cy="32" r="16" fill={LOGO_COLORS.you} />
          <circle cx="38.4" cy="32" r="16" fill={LOGO_COLORS.them} />
          <path d={LENS} fill={LOGO_COLORS.spark} />
        </>
      )}
    </svg>
  );
}

export function Logo({
  variant = "horizontal",
  size = 32,
  className = "",
}: {
  variant?: "horizontal" | "stacked";
  /** Mark size in px; the wordmark scales with it. */
  size?: number;
  className?: string;
}) {
  const stacked = variant === "stacked";
  return (
    <span
      role="img"
      aria-label={NAME}
      className={`inline-flex items-center ${stacked ? "flex-col gap-1" : "gap-2.5"} ${className}`}
    >
      <LogoMark size={size} decorative />
      <span
        aria-hidden="true"
        className="font-sans font-black text-text whitespace-nowrap"
        style={{ fontSize: size * (stacked ? 0.29 : 0.56), letterSpacing: "-0.015em", lineHeight: 1 }}
      >
        {NAME}
      </span>
    </span>
  );
}
