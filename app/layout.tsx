import type { Metadata } from "next";
import { Playfair_Display, Lato } from "next/font/google";
import { Toaster } from "react-hot-toast";
import SkipLink from "@/components/ui/SkipLink";
import Providers from "@/components/Providers";
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
  weight: ["300", "400", "700"],
  subsets: ["latin"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "What's Up Next",
  description: "Track movies you want to watch and have watched",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${lato.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // Apply a saved theme choice before paint. With no choice saved, there's
            // no data-theme and globals.css follows prefers-color-scheme.
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
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
