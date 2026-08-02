import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  // Public, shareable deeplinks — viewable without signing in.
  const isPublicDetailPage =
    /^\/movie\/\d+$/.test(req.nextUrl.pathname) || /^\/tv\/\d+$/.test(req.nextUrl.pathname);

  if (!isLoggedIn && !isAuthPage && !isPublicDetailPage && req.nextUrl.pathname !== "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoggedIn && (isAuthPage || req.nextUrl.pathname === "/")) {
    return NextResponse.redirect(new URL("/search", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
