import { prisma } from "./db";

/**
 * The signed-in user's saved streaming service IDs, for sorting "Where to watch".
 * Only ever called with the session's own user ID. Returns [] when signed out or on error,
 * so a database hiccup never breaks a public detail page.
 */
export async function getUserServiceIds(userId: string | null | undefined): Promise<number[]> {
  if (!userId) return [];
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { streamingServices: true } });
    return user?.streamingServices ?? [];
  } catch {
    return [];
  }
}
