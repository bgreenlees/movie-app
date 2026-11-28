import type { NextConfig } from "next";
import { securityHeaders } from "./lib/securityHeaders";

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
        // Static headers only. The page CSP needs a per-request nonce, so
        // middleware.ts sets it (lib/securityHeaders.ts).
        headers: securityHeaders(),
      },
    ];
  },
};

export default nextConfig;
