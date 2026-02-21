import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");

  // Redirect to login if not authenticated and trying to access protected pages
  if (!isLoggedIn && !isAuthPage && req.nextUrl.pathname !== "/") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Redirect to search if already logged in and trying to access auth pages or homepage
  if (isLoggedIn && (isAuthPage || req.nextUrl.pathname === "/")) {
    return NextResponse.redirect(new URL("/search", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
