import { NextResponse } from "next/server";
import Parser from "rss-parser";

type CustomItem = {
  "media:content"?: { $?: { url?: string } };
  "media:thumbnail"?: { $?: { url?: string } };
  enclosure?: { url?: string; type?: string };
};

const parser = new Parser<Record<string, unknown>, CustomItem>({
  customFields: {
    item: [
      ["media:content", "media:content"],
      ["media:thumbnail", "media:thumbnail"],
    ],
  },
  timeout: 8000,
});

const FEEDS: { name: string; url: string; color: string }[] = [
  { name: "What's on Netflix", url: "https://www.whats-on-netflix.com/feed/", color: "#e50914" },
  { name: "Cord Cutters News", url: "https://cordcuttersnews.com/feed/", color: "#0077b6" },
  { name: "Decider", url: "https://decider.com/feed/", color: "#ff6b35" },
  { name: "Variety", url: "https://variety.com/feed/", color: "#8b0000" },
  { name: "Collider", url: "https://collider.com/feed/", color: "#6a0dad" },
  { name: "/Film", url: "https://www.slashfilm.com/feed/", color: "#1a7a4a" },
  { name: "Roger Ebert", url: "https://www.rogerebert.com/feed", color: "#c0392b" },
  { name: "The Playlist", url: "https://theplaylist.net/feed/", color: "#2980b9" },
  { name: "Little White Lies", url: "https://lwlies.com/feed/", color: "#e74c3c" },
  { name: "Screen Rant", url: "https://screenrant.com/feed/", color: "#e67e22" },
];

function extractImage(item: CustomItem & Record<string, unknown>): string | null {
  // Try media:content
  const mc = item["media:content"];
  if (mc?.$ ?.url) return mc.$.url;

  // Try media:thumbnail
  const mt = item["media:thumbnail"];
  if (mt?.$ ?.url) return mt.$.url;

  // Try enclosure
  if (item.enclosure?.url && item.enclosure?.type?.startsWith("image/")) {
    return item.enclosure.url;
  }

  // Try first <img> in content
  const html = (item as Record<string, unknown>)["content:encoded"] as string | undefined
    ?? (item as Record<string, unknown>).content as string | undefined
    ?? "";
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (match?.[1]) return match[1];

  return null;
}

export interface NewsArticle {
  title: string;
  link: string;
  date: string;
  source: string;
  sourceColor: string;
  excerpt: string;
  image: string | null;
}

export async function GET() {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        next: { revalidate: 1800 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MovieApp/1.0; +https://github.com)" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const parsed = await parser.parseString(text);
      return { feed, items: parsed.items };
    })
  );

  const articles: NewsArticle[] = [];

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { feed, items } = result.value;

    for (const item of items.slice(0, 15)) {
      if (!item.title || !item.link) continue;
      const rawExcerpt = item.contentSnippet ?? item.content ?? "";
      const excerpt = rawExcerpt.replace(/<[^>]+>/g, "").trim().slice(0, 180);

      articles.push({
        title: item.title,
        link: item.link,
        date: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
        source: feed.name,
        sourceColor: feed.color,
        excerpt,
        image: extractImage(item as CustomItem & Record<string, unknown>),
      });
    }
  }

  // Sort newest first
  articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({ articles: articles.slice(0, 60) });
}
