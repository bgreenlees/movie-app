import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "./db";
import { authConfig } from "./auth.config";
import { devLoginProviders } from "./devLogin";
import { convertInvites } from "./invites";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    // Empty unless NODE_ENV !== "production" AND DEV_LOGIN === "1". See lib/devLogin.ts.
    ...devLoginProviders(),
  ],
  callbacks: {
    // Users are matched by email in jwt() below, so only trust an email Google has
    // verified (security audit F12). Other providers (dev-login) have their own gates.
    async signIn({ account, profile }) {
      if (account?.provider === "google") return profile?.email_verified === true;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        let dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (!dbUser) {
          dbUser = await prisma.user.create({
            data: { email: user.email, name: user.name },
          });
        }
        token.id = dbUser.id;
        // Both Google and dev-login pass through here. Never throws.
        await convertInvites(dbUser.id, user.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
