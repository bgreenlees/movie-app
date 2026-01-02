import Image from "next/image";
import { tmdb } from "@/lib/tmdb";

interface MovieCardProps {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate?: string;
  overview?: string;
  children?: React.ReactNode;
}

export default function MovieCard({
  id,
  title,
  posterPath,
  releaseDate,
  overview,
  children,
}: MovieCardProps) {
  const posterUrl = tmdb.getPosterUrl(posterPath);
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden border border-[var(--border)] hover:shadow-md transition-shadow">
      <div className="relative w-full aspect-[2/3] bg-gray-200">
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            No Image
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-lg mb-1 line-clamp-2" style={{ color: "var(--primary)" }}>
          {title}
        </h3>
        {year && (
          <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
            {year}
          </p>
        )}
        {overview && (
          <p className="text-sm line-clamp-3 mb-3" style={{ color: "var(--foreground)" }}>
            {overview}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
