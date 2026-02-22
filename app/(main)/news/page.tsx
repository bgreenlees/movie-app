"use client";

import { useEffect, useState } from "react";
import type { NewsArticle } from "@/app/api/news/route";

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 6) return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
}

function ArticleCard({ article }: { article: NewsArticle }) {
  const [imgError, setImgError] = useState(false);

  return (
    <a
      href={article.link}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col rounded-lg overflow-hidden border hover:shadow-lg transition-shadow group"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
    >
      {/* Image */}
      <div className="relative w-full aspect-video overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
        {article.image && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.image}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-2xl font-bold text-white/60"
            style={{ backgroundColor: article.sourceColor + "33" }}
          >
            {article.source.charAt(0)}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Source + date */}
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: article.sourceColor }}
          >
            {article.source}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {relativeTime(article.date)}
          </span>
        </div>

        {/* Title */}
        <h3
          className="text-sm font-semibold leading-snug line-clamp-2 group-hover:underline"
          style={{ color: "var(--foreground)" }}
        >
          {article.title}
        </h3>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="text-xs line-clamp-3 flex-1" style={{ color: "var(--text-muted)" }}>
            {article.excerpt}
          </p>
        )}

        {/* Read more */}
        <span className="text-xs font-medium mt-1" style={{ color: "var(--accent)" }}>
          Read more →
        </span>
      </div>
    </a>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg overflow-hidden border animate-pulse" style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}>
      <div className="w-full aspect-video" style={{ backgroundColor: "var(--border)" }} />
      <div className="p-4 flex flex-col gap-3">
        <div className="h-4 w-24 rounded" style={{ backgroundColor: "var(--border)" }} />
        <div className="h-4 w-full rounded" style={{ backgroundColor: "var(--border)" }} />
        <div className="h-4 w-3/4 rounded" style={{ backgroundColor: "var(--border)" }} />
        <div className="h-3 w-full rounded" style={{ backgroundColor: "var(--border)" }} />
        <div className="h-3 w-5/6 rounded" style={{ backgroundColor: "var(--border)" }} />
      </div>
    </div>
  );
}

export default function NewsPage() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/news")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setArticles(data.articles ?? []))
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
        News
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
        Latest from Decider, Variety, Cord Cutters News, What's on Netflix, and more
      </p>

      {error && (
        <p style={{ color: "var(--text-muted)" }}>Failed to load news. Try refreshing.</p>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {isLoading
          ? Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)
          : articles.map((article) => (
              <ArticleCard key={article.link + article.date} article={article} />
            ))}
      </div>
    </div>
  );
}
