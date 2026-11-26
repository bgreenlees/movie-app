import { prisma } from "@/lib/db";

/**
 * Returns the ACCEPTED connection between two users (in either direction),
 * or null. Every Watch Together / Decide route must resolve the other person
 * through this helper, never by trusting an id from the client.
 *
 * PENDING and DECLINED connections, a user with themselves, and empty ids
 * all return null.
 */
export async function requireConnection(myId: string, otherId: string) {
  if (!myId || !otherId || myId === otherId) return null;

  return prisma.userConnection.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: myId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: myId },
      ],
    },
  });
}
