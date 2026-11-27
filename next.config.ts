import type { NextConfig } from "next";
import { cspMode, securityHeaders } from "./lib/securityHeaders";

const nextConfig: NextConfig = {
  // Don't advertise the framework (security audit F3).
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        // VERCEL_ENV is set at build time on Vercel: "production", "preview" or "development".
        headers: securityHeaders(
          process.env.NODE_ENV === "development",
          cspMode(process.env.NODE_ENV, process.env.VERCEL_ENV),
        ),
      },
    ];
  },
};

export default nextConfig;
