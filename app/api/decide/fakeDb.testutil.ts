// Test-only: a tiny in-memory stand-in for the Prisma calls the decide routes
// make, so route tests can run a whole session (start → vote → resolve)
// without a database. It supports just the query shapes those routes use:
// equality, { in }, { gt }, { gte }, { lt }, OR, orderBy, select/include of
// the connection, and nested candidate create. Not imported by app code.

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

let counter = 0;
const newId = (prefix: string) => `${prefix}${(++counter).toString(36).padStart(6, "0")}`;

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    const value = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { in?: unknown[]; gt?: Date | number; gte?: Date | number; lt?: Date | number };
      const v = value instanceof Date ? value.getTime() : (value as number);
      const n = (x: Date | number) => (x instanceof Date ? x.getTime() : x);
      if (c.in && !c.in.includes(value)) return false;
      if (c.gt !== undefined && !(v > n(c.gt))) return false;
      if (c.gte !== undefined && !(v >= n(c.gte))) return false;
      if (c.lt !== undefined && !(v < n(c.lt))) return false;
      return true;
    }
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    return value === cond;
  });
}

type OrderBy = Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];
function sorted<T extends Row>(rows: T[], orderBy?: OrderBy): T[] {
  if (!orderBy) return rows;
  const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).flatMap((o) => Object.entries(o));
  const val = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
  return [...rows].sort((a, b) => {
    for (const [k, dir] of keys) {
      const d = val(a[k]) - val(b[k]);
      if (d !== 0) return dir === "asc" ? d : -d;
    }
    return 0;
  });
}

function pick<T extends Row>(row: T, select?: Record<string, unknown>): Row {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).filter((k) => k in row).map((k) => [k, row[k]]));
}

export function createFakeDb() {
  const store = {
    users: [] as Row[],
    connections: [] as Row[],
    sessions: [] as Row[],
    candidates: [] as Row[],
    votes: [] as Row[],
  };

  const withConnection = (s: Row, include?: { connection?: unknown }) => {
    if (!include?.connection) return { ...s };
    const c = store.connections.find((x) => x.id === s.connectionId);
    return { ...s, connection: c ? { ...c } : null };
  };

  const cascadeSession = (ids: Set<unknown>) => {
    store.candidates = store.candidates.filter((c) => !ids.has(c.sessionId));
    store.votes = store.votes.filter((v) => !ids.has(v.sessionId));
  };

  const db = {
    store,
    reset() {
      store.users = [];
      store.connections = [];
      store.sessions = [];
      store.candidates = [];
      store.votes = [];
    },
    // Runs the callback against the same store; the options (isolation level)
    // are what the tests inspect through a spy.
    $transaction: async <T>(...args: [fn: (tx: unknown) => Promise<T>, options?: { isolationLevel?: string }]) =>
      args[0](db),
    user: {
      findUnique: async ({ where, select }: { where: { id: string }; select?: Row }) => {
        const u = store.users.find((x) => x.id === where.id);
        return u ? pick(u, select) : null;
      },
    },
    userConnection: {
      findFirst: async ({ where }: { where: Where }) => {
        const c = store.connections.find((x) => matches(x, where));
        return c ? { ...c } : null;
      },
    },
    decideSession: {
      findUnique: async ({ where, include }: { where: { id: string }; include?: { connection?: unknown } }) => {
        const s = store.sessions.find((x) => x.id === where.id);
        return s ? withConnection(s, include) : null;
      },
      findFirst: async ({ where, orderBy, select }: { where: Where; orderBy?: OrderBy; select?: Row }) => {
        const s = sorted(store.sessions.filter((x) => matches(x, where)), orderBy)[0];
        return s ? pick(s, select) : null;
      },
      count: async ({ where }: { where: Where }) => store.sessions.filter((x) => matches(x, where)).length,
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const hit = store.sessions.filter((x) => matches(x, where));
        hit.forEach((s) => Object.assign(s, data));
        return { count: hit.length };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const gone = new Set(store.sessions.filter((x) => matches(x, where)).map((s) => s.id));
        store.sessions = store.sessions.filter((s) => !gone.has(s.id));
        cascadeSession(gone);
        return { count: gone.size };
      },
      create: async ({ data, select }: { data: Row & { candidates?: { create: Row[] } }; select?: Row }) => {
        const { candidates, ...fields } = data;
        const session: Row = {
          id: newId("s"),
          status: "OPEN",
          round: 1,
          winnerId: null,
          createdAt: new Date(),
          resolvedAt: null,
          ...fields,
        };
        store.sessions.push(session);
        for (const c of candidates?.create ?? []) store.candidates.push({ id: newId("c"), sessionId: session.id, ...c });
        return pick(session, select);
      },
    },
    decideCandidate: {
      findMany: async ({ where, orderBy, select }: { where: Where; orderBy?: OrderBy; select?: Row }) =>
        sorted(store.candidates.filter((x) => matches(x, where)), orderBy).map((c) => pick(c, select)),
      findFirst: async ({ where, select }: { where: Where; select?: Row }) => {
        const c = store.candidates.find((x) => matches(x, where));
        return c ? pick(c, select) : null;
      },
      count: async ({ where }: { where: Where }) => store.candidates.filter((x) => matches(x, where)).length,
    },
    decideVote: {
      findMany: async ({ where, select }: { where: Where; select?: Row }) =>
        store.votes.filter((x) => matches(x, where)).map((v) => pick(v, select)),
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { candidateId_userId: { candidateId: string; userId: string } };
        create: Row;
        update: Row;
      }) => {
        const { candidateId, userId } = where.candidateId_userId;
        const existing = store.votes.find((v) => v.candidateId === candidateId && v.userId === userId);
        if (existing) return Object.assign(existing, update);
        const row = { id: newId("v"), ...create };
        store.votes.push(row);
        return row;
      },
    },
  };
  return db;
}

export type FakeDb = ReturnType<typeof createFakeDb>;
