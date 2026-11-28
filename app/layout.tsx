import type { Metadata, Viewport } from "next";
import { Playfair_Display, Lato } from "next/font/google";
import { Toaster } from "react-hot-toast";
import SkipLink from "@/components/ui/SkipLink";
import Providers from "@/components/Providers";
import { THEME_SCRIPT } from "@/lib/themeScript";
import "./globals.css";

// next/font self-hosts both fonts. The variables are set on <html> so the
// --font-sans / --font-display tokens in globals.css (declared on :root) can use them.
const playfair = Playfair_Display({
  weight: ["700"],
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const lato = Lato({
  weight: ["300", "400", "700", "900"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "What's Up Next",
  description: "Track movies you want to watch and have watched",
};

// viewport-fit=cover lets the mobile tab bar use env(safe-area-inset-bottom) on notched phones.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${lato.variable}`} suppressHydrationWarning>
      <head>
        {/* Applies a saved theme before paint. Allowed by its hash in the page CSP, so
            keep its text in lib/themeScript.ts. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <SkipLink />
        <Providers>
          {children}
          <Toaster position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
