import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Watchlist",
  description: "Track movies you want to watch and have watched",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
