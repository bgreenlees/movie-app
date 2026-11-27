// Shared button classes for the detail-page hero (Cinema dark: 44px tall, rounded-control).
const base =
  "inline-flex items-center justify-center gap-2 h-11 rounded-control text-[15px] font-bold leading-none transition-colors duration-150 disabled:opacity-60";

/** The one primary action: "+ Want to Watch". */
export const heroPrimaryButton = `${base} px-5 bg-accent text-white hover:bg-accent-hover`;

/** Secondary actions (Trailer, Share) and the "✓ On your list" state. */
export const heroSecondaryButton = `${base} px-[18px] border border-border bg-surface-2 text-text hover:bg-surface`;
