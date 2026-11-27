import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
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
