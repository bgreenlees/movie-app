import type { NextAuthConfig } from "next-auth";
import { SESSION_MAX_AGE_S, SESSION_UPDATE_AGE_S } from "./sessionVersion";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  // Shared with middleware, which only verifies the JWT's signature and expiry:
  // it can't reach Prisma. The revocation check (sessionVersion) lives in the
  // jwt callback in lib/auth.ts, which every auth() call in a route or page runs.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S, updateAge: SESSION_UPDATE_AGE_S },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    // Failed sign-ins (e.g. an unverified Google email) come back to /login?error=…,
    // which shows a message, instead of Auth.js's bare error page.
    error: "/login",
  },
};
