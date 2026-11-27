import Image from "next/image";

interface DetailHeroProps {
  title: string;
  backdropUrl: string | null;
  posterUrl: string | null;
  eyebrow: string;
  meta: string;
  tagline?: string | null;
  overview?: string | null;
  /** Extra lines under the overview, e.g. "Director · Denis Villeneuve". */
  credits?: Array<{ label: string; value: string }>;
  actions: React.ReactNode;
}

// Fades the backdrop into the page colour at the bottom (where the text sits) and
// stays light at the top so the art shows. It uses --color-bg, so it works in both themes.
const SCRIM =
  "linear-gradient(to top, var(--color-bg) 0%, color-mix(in srgb, var(--color-bg) 90%, transparent) 30%, color-mix(in srgb, var(--color-bg) 40%, transparent) 65%, color-mix(in srgb, var(--color-bg) 10%, transparent) 100%)";

// Shown when TMDB has no backdrop: a soft accent glow instead of a photo.
const FALLBACK =
  "radial-gradient(ellipse at 70% 0%, color-mix(in srgb, var(--color-accent) 28%, transparent) 0%, transparent 65%), var(--color-surface)";

export default function DetailHero({ title, backdropUrl, posterUrl, eyebrow, meta, tagline, overview, credits = [], actions }: DetailHeroProps) {
  return (
    <section aria-labelledby="detail-title" className="relative isolate overflow-hidden bg-bg">
      {backdropUrl ? (
        <Image src={backdropUrl} alt="" fill priority sizes="100vw" className="-z-20 object-cover object-top" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 -z-20" style={{ background: FALLBACK }} />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10" style={{ backgroundImage: SCRIM }} />

      <div
        className={`mx-auto flex max-w-[1376px] flex-col gap-6 px-4 sm:flex-row sm:items-end sm:px-6 lg:gap-10 lg:px-8 ${
          backdropUrl ? "pt-40 sm:pt-52 lg:pt-[196px]" : "pt-8 sm:pt-12"
        }`}
      >
        <div className="relative aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-card bg-surface-2 shadow-pop sm:w-48 lg:w-60">
          {posterUrl ? (
            <Image src={posterUrl} alt={`${title} poster`} fill priority sizes="(min-width: 1024px) 240px, (min-width: 640px) 192px, 128px" className="object-cover" />
          ) : (
            <div aria-hidden="true" className="flex h-full w-full items-center justify-center font-display text-display text-muted">
              {title.charAt(0)}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 pb-2">
          <p className="text-label uppercase text-accent-text">{eyebrow}</p>
          <h1 id="detail-title" className="font-display text-display text-text lg:text-[56px] lg:leading-[60px]">
            {title}
          </h1>
          {meta && <p className="text-[15px] leading-6 text-text/85">{meta}</p>}
          {tagline && <p className="text-body italic text-muted">&ldquo;{tagline}&rdquo;</p>}
          {overview && <p className="max-w-[680px] text-body text-text/85">{overview}</p>}
          {credits.length > 0 && (
            <dl className="flex flex-col gap-1 text-meta">
              {credits.map((c) => (
                <div key={c.label} className="flex gap-2">
                  <dt className="font-bold text-muted">{c.label}</dt>
                  <dd className="text-text">{c.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-2 flex flex-wrap gap-3">{actions}</div>
        </div>
      </div>
    </section>
  );
}
