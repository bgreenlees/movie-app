import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { loginUrlWithCallback } from "@/lib/callbackUrl";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, cspHeaderName, cspMode, generateNonce } from "@/lib/securityHeaders";
import { themeScriptHashSource } from "@/lib/themeScript";

const { auth } = NextAuth(authConfig);

/**
 * Builds this request's page CSP with a fresh nonce. It goes on the request headers
 * too, because that is where Next.js reads the nonce to add it to its own scripts
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 */
async function pageCsp(req: NextRequest) {
  const mode = cspMode(process.env.NODE_ENV, process.env.VERCEL_ENV);
  const name = cspHeaderName(mode);
  const value = contentSecurityPolicy({
    nonce: generateNonce(),
    scriptHashes: [await themeScriptHashSource()],
    isDev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(name, value);
  return { name, value, requestHeaders };
}

export default auth(async (req) => {
  const csp = await pageCsp(req);
  const withCsp = (res: NextResponse) => {
    res.headers.set(csp.name, csp.value);
    return res;
  };

  const isLoggedIn = !!req.auth;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  // Public, shareable deeplinks — viewable without signing in.
  const isPublicDetailPage =
    /^\/movie\/\d+$/.test(req.nextUrl.pathname) || /^\/tv\/\d+$/.test(req.nextUrl.pathname);

  if (!isLoggedIn && !isAuthPage && !isPublicDetailPage && req.nextUrl.pathname !== "/") {
    const { pathname, search } = req.nextUrl;
    return withCsp(NextResponse.redirect(new URL(loginUrlWithCallback(pathname + search), req.url)));
  }

  if (isLoggedIn && (isAuthPage || req.nextUrl.pathname === "/")) {
    return withCsp(NextResponse.redirect(new URL("/search", req.url)));
  }

  return withCsp(NextResponse.next({ request: { headers: csp.requestHeaders } }));
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|icons/).*)"],
};
