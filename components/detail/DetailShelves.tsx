import Image from "next/image";
import Link from "next/link";
import type { ProviderOption } from "@/lib/detailView";

function Shelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-h2 text-text">{title}</h2>
      {children}
    </section>
  );
}

export function WhereToWatch({ providers }: { providers: ProviderOption[] }) {
  if (providers.length === 0) return null;
  return (
    <Shelf title="Where to watch">
      <ul className="flex flex-wrap gap-3">
        {providers.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-card border bg-surface py-2.5 pl-2.5 pr-4 ${
              p.yours ? "border-accent" : "border-border"
            }`}
          >
            {p.logoPath ? (
              <Image src={`https://image.tmdb.org/t/p/w92${p.logoPath}`} alt="" width={40} height={40} className="rounded-control" />
            ) : (
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-control bg-surface-2 font-bold text-text">
                {p.name.charAt(0)}
              </span>
            )}
            <span className="flex flex-col leading-[18px]">
              <span className="text-sm font-bold text-text">{p.name}</span>
              <span className="text-meta text-muted">
                {p.kind}
                {p.yours && <span className="text-accent-text"> · Your service</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Shelf>
  );
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export function CastShelf({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;
  return (
    <Shelf title="Cast">
      <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {cast.map((member) => (
          <li key={member.id} className="w-24 shrink-0 snap-start lg:w-auto lg:min-w-24 lg:flex-1">
            <Link
              href={`/search?personId=${member.id}&name=${encodeURIComponent(member.name)}`}
              className="group flex flex-col items-center gap-2 text-center"
            >
              <span className="relative block h-20 w-20 overflow-hidden rounded-full bg-surface-2 sm:h-24 sm:w-24">
                {member.profile_path ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                    alt=""
                    fill
                    sizes="96px"
                    className="object-cover transition-opacity duration-150 group-hover:opacity-85"
                  />
                ) : (
                  <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-h2 text-muted">
                    {member.name.charAt(0)}
                  </span>
                )}
              </span>
              <span className="text-sm font-bold leading-[18px] text-text group-hover:underline">{member.name}</span>
              {member.character && <span className="text-meta text-muted">{member.character}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </Shelf>
  );
}

export interface SimilarItem {
  id: number;
  title: string;
  href: string;
  posterPath: string | null;
  meta: string;
}

export function MoreLikeThis({ items }: { items: SimilarItem[] }) {
  if (items.length === 0) return null;
  return (
    <Shelf title="More like this">
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:pb-0">
        {items.map((item) => (
          <li key={item.id} className="w-32 shrink-0 snap-start sm:w-36 lg:w-auto lg:min-w-0 lg:nth-[n+8]:hidden">
            <Link href={item.href} className="group flex min-w-0 flex-col gap-2.5">
              <span className="relative block aspect-[2/3] overflow-hidden rounded-card bg-surface-2 shadow-card">
                {item.posterPath ? (
                  <Image
                    src={`https://image.tmdb.org/t/p/w300${item.posterPath}`}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 180px, 144px"
                    className="object-cover transition-opacity duration-150 group-hover:opacity-90"
                  />
                ) : (
                  <span aria-hidden="true" className="flex h-full w-full items-center justify-center p-2 text-center text-meta text-muted">
                    {item.title}
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-title text-text">{item.title}</span>
                {item.meta && <span className="block text-meta text-muted">{item.meta}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Shelf>
  );
}
