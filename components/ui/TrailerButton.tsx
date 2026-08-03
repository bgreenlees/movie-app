"use client";

import { useState } from "react";
import TrailerModal from "@/components/movies/TrailerModal";

interface TrailerButtonProps {
  id: number;
  title: string;
  mediaType?: "movie" | "tv";
}

export default function TrailerButton({ id, title, mediaType = "movie" }: TrailerButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border transition-colors hover:bg-[var(--hover-bg)]"
        style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M8 5v14l11-7z" />
        </svg>
        Trailer
      </button>
      {open && (
        <TrailerModal
          movieId={id}
          movieTitle={title}
          mediaType={mediaType}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
