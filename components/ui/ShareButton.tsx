"use client";

import { useState } from "react";
import toast from "react-hot-toast";

interface ShareButtonProps {
  /** Absolute or root-relative URL to share. Falls back to the current page URL if omitted. */
  url?: string;
  title: string;
  text?: string;
  variant?: "icon" | "button";
  className?: string;
}

function resolveUrl(url?: string): string {
  if (typeof window === "undefined") return url || "";
  if (!url) return window.location.href;
  return url.startsWith("http") ? url : `${window.location.origin}${url}`;
}

export default function ShareButton({ url, title, text, variant = "button", className }: ShareButtonProps) {
  const [justCopied, setJustCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const fullUrl = resolveUrl(url);

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(fullUrl);
      setJustCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy link");
    }
  };

  const shareIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342a3 3 0 100 2.316m0-2.316a3 3 0 110-2.316m0 2.316l6.632 3.316m-6.632-5.632l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 8.632a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
    </svg>
  );

  if (variant === "icon") {
    return (
      <button
        onClick={handleShare}
        className={className ?? "shrink-0 hover:opacity-70 transition-opacity"}
        style={{ color: "var(--text-muted)" }}
        aria-label="Share"
        title="Share"
      >
        {shareIcon}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={
        className ??
        "flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border transition-colors hover:bg-[var(--hover-bg)]"
      }
      style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
    >
      {shareIcon}
      {justCopied ? "Copied!" : "Share"}
    </button>
  );
}
