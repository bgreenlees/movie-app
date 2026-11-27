import { PrismaClient } from "@prisma/client";

/**
 * Removes everything the smoke tests created: their users (watchlist entries,
 * connections and Watch Together sessions go with them via cascade), and the
 * stub titles cached in the movies / tv_shows tables.
 */
export default async function globalTeardown() {
  if (!process.env.DATABASE_URL || /ep-rough-art/.test(process.env.DATABASE_URL)) return;
  const prisma = new PrismaClient();
  try {
    await prisma.user.deleteMany({ where: { email: { startsWith: "e2e-", endsWith: "@example.test" } } });
    await prisma.movie.deleteMany({ where: { id: { gte: 990000, lt: 991000 } } });
    await prisma.tVShow.deleteMany({ where: { id: { gte: 990000, lt: 991000 } } });
  } finally {
    await prisma.$disconnect();
  }
}
