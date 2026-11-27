import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SELECTION, candidateKey, type MediaType, type MoodCandidate, type MoodSelection } from "./moodPicker";
import {
  FACTS_BUDGET,
  PAIR_POOL_SIZE,
  buildPairPool,
  excludedKeys,
  parsePairPicksQuery,
  reasonFor,
  withArticle,
  resolveServices,
  type FullTitleFacts,
  type PairPoolInput,
  type PoolEntry,
  type PoolFetchers,
  type PoolPerson,
} from "./pairPool";

const TODAY = new Date("2026-11-26T12:00:00Z");
const ANY: MoodSelection = { ...DEFAULT_SELECTION };

let clock = 1_000;
function entry(mediaType: MediaType, tmdbId: number, over: Partial<PoolEntry> = {}): PoolEntry {
  return {
    mediaType,
    tmdbId,
    status: "WANT_TO_WATCH",
    rating: null,
    addedAt: clock++,
    title: `${mediaType} ${tmdbId}`,
    posterPath: `/p${tmdbId}.jpg`,
    date: "2020-01-01",
    genreIds: mediaType === "movie" ? [18] : [18],
    ...over,
  };
}

function cand(mediaType: MediaType, id: number, over: Partial<MoodCandidate> = {}): MoodCandidate {
  return {
    id,
    mediaType,
    title: `${mediaType} ${id}`,
    posterPath: `/p${id}.jpg`,
    date: "2021-01-01",
    overview: "",
    popularity: 10,
    voteAverage: 7.2,
    voteCount: 1000,
    genreIds: [18],
    ...over,
  };
}

interface FakeTmdb {
  discover?: Partial<Record<MediaType, MoodCandidate[]>>;
  recs?: Record<string, MoodCandidate[]>;
  /** Per title key: overrides for its details */
  facts?: Record<string, Partial<FullTitleFacts>>;
}

function fakeFetchers(t: FakeTmdb = {}) {
  const fetchers = {
    facts: vi.fn(async (media: MediaType, id: number): Promise<FullTitleFacts> => ({
      id,
      title: `${media} ${id}`,
      posterPath: `/p${id}.jpg`,
      date: "2021-01-01",
      overview: "",
      popularity: 10,
      voteAverage: 7.2,
      voteCount: 1000,
      genreIds: [18],
      runtime: 100,
      providerIds: [],
      ...t.facts?.[candidateKey({ id, mediaType: media })],
    })),
    recommendations: vi.fn(async (media: MediaType, id: number) => t.recs?.[candidateKey({ id, mediaType: media })] ?? []),
    discover: vi.fn(async (media: MediaType, _params: Record<string, string>, page: number) => {
      const all = t.discover?.[media] ?? [];
      return { total: all.length, candidates: all.slice((page - 1) * 20, page * 20) };
    }),
  } satisfies PoolFetchers;
  return fetchers;
}

function input(over: Partial<PairPoolInput> & { fetchers: PoolFetchers }): PairPoolInput {
  return {
    me: { entries: [], providerIds: [] },
    partner: { entries: [], providerIds: [] },
    partnerName: "Sam",
    selection: ANY,
    sharedOnly: false,
    today: TODAY,
    ...over,
  };
}

const keys = (pool: { id: number; mediaType: MediaType }[]) => pool.map(candidateKey).sort();

describe("excludes", () => {
  it("drops anything either person watched, is watching or isn't interested in, from every source", async () => {
    const me: PoolPerson = {
      entries: [
        entry("movie", 1, { status: "WATCHED", rating: 2 }),
        entry("tv", 2, { status: "WANT_TO_WATCH" }), // partner is watching it
        entry("movie", 9, { status: "WANT_TO_WATCH" }),
        entry("movie", 50, { rating: 3, status: "WATCHED" }), // a Love seed
      ],
      providerIds: [],
    };
    const partner: PoolPerson = {
      entries: [
        entry("tv", 2, { status: "WATCHING" }),
        entry("movie", 3, { status: "NOT_INTERESTED" }),
        entry("movie", 1, { status: "WANT_TO_WATCH" }), // I've watched it
      ],
      providerIds: [],
    };
    const fetchers = fakeFetchers({
      discover: { movie: [cand("movie", 1), cand("movie", 3), cand("movie", 4)], tv: [cand("tv", 2), cand("tv", 5)] },
      recs: { "movie-50": [cand("movie", 3), cand("movie", 6)] },
    });

    const { pool } = await buildPairPool(input({ me, partner, fetchers }));

    expect(keys(pool)).toEqual(["movie-4", "movie-6", "movie-9", "tv-5"]);
    expect(excludedKeys(me, partner)).toEqual(new Set(["movie-1", "movie-50", "tv-2", "movie-3"]));
  });
});

describe("services", () => {
  it("resolves union by default and intersection with sharedOnly", () => {
    expect(resolveServices([8, 9], [9, 15], false)).toMatchObject({ mode: "union", providerIds: [8, 9, 15] });
    expect(resolveServices([8, 9], [9, 15], true)).toMatchObject({ mode: "shared", providerIds: [9] });
    expect(resolveServices([8, 9], [9, 15], true).state).toEqual({ mine: true, partners: true, shared: [9] });
  });

  it("uses the one person's services when only they have any, even with sharedOnly", () => {
    expect(resolveServices([], [15], false)).toMatchObject({ mode: "partners", providerIds: [15] });
    expect(resolveServices([], [15], true)).toMatchObject({ mode: "partners", providerIds: [15] });
    expect(resolveServices([8], [], true)).toMatchObject({ mode: "mine", providerIds: [8] });
    expect(resolveServices([], [], true)).toMatchObject({ mode: "none", providerIds: [] });
  });

  it("canonicalises retired and tier ids", () => {
    expect(resolveServices([531], [2616], true).providerIds).toEqual([2303]);
  });

  const services = { ...ANY, onMyServices: true };
  const wantBoth = (): Pick<PairPoolInput, "me" | "partner"> => ({
    me: { entries: [entry("movie", 10), entry("movie", 11)], providerIds: [8, 9] },
    partner: { entries: [], providerIds: [9, 15] },
  });
  const onServices = { "movie-10": { providerIds: [8] }, "movie-11": { providerIds: [9] } };

  it("filters to either person's services (union): discover params and want-list titles", async () => {
    const fetchers = fakeFetchers({ facts: onServices });
    const r = await buildPairPool(input({ ...wantBoth(), selection: services, fetchers }));
    expect(keys(r.pool)).toEqual(["movie-10", "movie-11"]);
    expect(fetchers.discover.mock.calls[0][1].with_watch_providers).toBe("8|9|15");
    expect(r.pool.find((c) => c.id === 10)?.providerIds).toEqual([8]);
  });

  it("filters to shared services only with sharedOnly (intersection)", async () => {
    const fetchers = fakeFetchers({ facts: onServices });
    const r = await buildPairPool(input({ ...wantBoth(), selection: services, sharedOnly: true, fetchers }));
    expect(keys(r.pool)).toEqual(["movie-11"]);
    expect(fetchers.discover.mock.calls[0][1].with_watch_providers).toBe("9");
  });

  it("returns nothing, without calling TMDB, when sharedOnly and no service is shared", async () => {
    const fetchers = fakeFetchers({ discover: { tv: [cand("tv", 1)] } });
    const r = await buildPairPool(
      input({
        me: { entries: [], providerIds: [8] },
        partner: { entries: [], providerIds: [15] },
        selection: services,
        sharedOnly: true,
        fetchers,
      })
    );
    expect(r.pool).toEqual([]);
    expect(r.services).toEqual({ mine: true, partners: true, shared: [] });
    expect(fetchers.discover).not.toHaveBeenCalled();
  });

  it("with one person having no services, filters by the other's", async () => {
    const fetchers = fakeFetchers({ facts: onServices });
    const r = await buildPairPool(
      input({
        me: { entries: [entry("movie", 10), entry("movie", 11)], providerIds: [] },
        partner: { entries: [], providerIds: [9] },
        selection: services,
        sharedOnly: true,
        fetchers,
      })
    );
    expect(keys(r.pool)).toEqual(["movie-11"]);
    expect(r.services).toEqual({ mine: false, partners: true, shared: [] });
  });

  it("ignores the services toggle when neither person has services", async () => {
    const fetchers = fakeFetchers({ discover: { tv: [cand("tv", 1)] } });
    const r = await buildPairPool(input({ selection: services, fetchers }));
    expect(keys(r.pool)).toEqual(["tv-1"]);
    expect(fetchers.discover.mock.calls[0][1].with_watch_providers).toBeUndefined();
    expect(fetchers.facts).not.toHaveBeenCalled();
  });
});

describe("one catalogue, no type quota", () => {
  it("returns all TV when every match is TV", async () => {
    const tv = Array.from({ length: 40 }, (_, i) => cand("tv", 100 + i));
    const fetchers = fakeFetchers({ discover: { movie: [], tv } });
    const { pool } = await buildPairPool(input({ fetchers }));
    expect(pool).toHaveLength(40);
    expect(pool.every((c) => c.mediaType === "tv")).toBe(true);
  });

  it("lets a movie Love seed TV through shared traits, with no movie slot reserved", async () => {
    // Both love sci-fi films; the only candidates are sci-fi shows and dramas.
    const loves = [878, 878, 878].map((g, i) => entry("movie", 500 + i, { status: "WATCHED", rating: 3, genreIds: [g] }));
    const fetchers = fakeFetchers({
      discover: {
        tv: [cand("tv", 1, { genreIds: [10765] }), cand("tv", 2, { genreIds: [10766] })],
      },
    });
    const { pool } = await buildPairPool(
      input({ me: { entries: loves, providerIds: [] }, partner: { entries: loves, providerIds: [] }, fetchers })
    );
    expect(pool.map((c) => c.id)).toEqual([1, 2]);
    expect(pool.every((c) => c.mediaType === "tv")).toBe(true);
  });
});

describe("reasons", () => {
  const BANNED = /dislik|didn.t like|not interested|hated|nope|avoid/i;

  it("never mention a dislike or not-interested title, and dislikes never seed recommendations", async () => {
    const partner: PoolPerson = {
      entries: [
        entry("movie", 1, { status: "WATCHED", rating: 1, title: "Hated Film" }),
        entry("tv", 2, { status: "NOT_INTERESTED", title: "Nope Show" }),
        entry("movie", 3, { status: "WATCHED", rating: 3, title: "Arrival" }),
        entry("tv", 4, { title: "Severance" }),
      ],
      providerIds: [],
    };
    const me: PoolPerson = {
      entries: [entry("movie", 5, { status: "WATCHED", rating: 3, title: "Heat" }), entry("tv", 4)],
      providerIds: [],
    };
    const fetchers = fakeFetchers({
      recs: {
        "movie-1": [cand("movie", 90)], // must never be asked for
        "movie-3": [cand("movie", 10), cand("movie", 11)],
        "movie-5": [cand("movie", 11), cand("movie", 12)],
      },
      discover: { movie: [cand("movie", 20)], tv: [cand("tv", 21)] },
    });

    const { pool } = await buildPairPool(input({ me, partner, fetchers }));

    expect(fetchers.recommendations.mock.calls.map(([m, id]) => `${m}-${id}`).sort()).toEqual(["movie-3", "movie-5"]);
    expect(pool.some((c) => c.id === 90)).toBe(false);
    for (const c of pool) expect(c.reason).not.toMatch(BANNED);
    const reason = (id: number) => pool.find((c) => c.id === id)?.reason;
    expect(reason(4)).toBe("On both your lists");
    expect(reason(10)).toBe("Because Sam loved Arrival");
    expect(reason(11)).toBe("Because you loved Heat and Sam loved Arrival");
    expect(reason(12)).toBe("Because you loved Heat");
    expect(reason(20)).toBe("Popular right now");
  });

  it("are mirrored for the partner with partnerView, and left out without it", async () => {
    const me: PoolPerson = {
      entries: [entry("movie", 5, { status: "WATCHED", rating: 3, title: "Heat" }), entry("tv", 6, { title: "Mine" })],
      providerIds: [],
    };
    const partner: PoolPerson = {
      entries: [entry("movie", 3, { status: "WATCHED", rating: 3, title: "Arrival" }), entry("tv", 7, { title: "Theirs" })],
      providerIds: [],
    };
    const fetchers = fakeFetchers({
      recs: { "movie-3": [cand("movie", 10), cand("movie", 11)], "movie-5": [cand("movie", 11)] },
    });

    const plain = await buildPairPool(input({ me, partner, fetchers }));
    expect(plain.pool.every((c) => c.partnerReason === undefined)).toBe(true);

    const { pool } = await buildPairPool(input({ me, partner, fetchers, partnerView: { myName: "Alex" } }));
    const view = (id: number) => {
      const c = pool.find((p) => p.id === id);
      return [c?.reason, c?.partnerReason];
    };
    expect(view(6)).toEqual(["On your list", "On Alex's list"]);
    expect(view(7)).toEqual(["On Sam's list", "On your list"]);
    expect(view(10)).toEqual(["Because Sam loved Arrival", "Because you loved Arrival"]);
    expect(view(11)).toEqual([
      "Because you loved Heat and Sam loved Arrival",
      "Because you loved Arrival and Alex loved Heat",
    ]);
  });

  it("use list wording, a fallback name and the mood", () => {
    const base = { c: cand("tv", 1, { voteAverage: 8, voteCount: 5000 }), seededBy: {} };
    expect(reasonFor({ ...base, wantedBy: new Set(["partner"]) }, null, ANY)).toBe("On your friend's list");
    expect(reasonFor({ ...base, wantedBy: new Set(["me"]) }, "Sam", ANY)).toBe("On your list");
    expect(reasonFor({ ...base, wantedBy: new Set(), seededBy: { me: "Up", partner: "Up" } }, "Sam", ANY)).toBe(
      "Because you both loved Up"
    );
    expect(reasonFor({ ...base, wantedBy: new Set() }, "Sam", { ...ANY, vibe: "light" })).toBe("Fits a light night");
    expect(reasonFor({ ...base, wantedBy: new Set() }, "Sam", ANY)).toBe("Highly rated");
  });

  it("uses 'an' before a vowel sound", () => {
    const base = { c: cand("tv", 1, { voteAverage: 8, voteCount: 5000 }), seededBy: {}, wantedBy: new Set<"me" | "partner">() };
    expect(reasonFor(base, "Sam", { ...ANY, vibe: "intense" })).toBe("Fits an intense night");
    expect(reasonFor(base, "Sam", { ...ANY, vibe: "heavy" })).toBe("Fits a heavy night");
  });
});

describe("withArticle", () => {
  it("picks a or an from the first letter", () => {
    expect(withArticle("intense")).toBe("an intense");
    expect(withArticle("Easy")).toBe("an Easy");
    expect(withArticle("light")).toBe("a light");
  });
});

describe("mood filter and ranking", () => {
  it("applies the mood to want lists and checks real movie runtimes from discover", async () => {
    const me: PoolPerson = {
      entries: [entry("movie", 1, { genreIds: [35] }), entry("movie", 2, { genreIds: [18] })],
      providerIds: [],
    };
    const fetchers = fakeFetchers({
      discover: { movie: [cand("movie", 3, { genreIds: [18] }), cand("movie", 4, { genreIds: [18] })] },
      facts: { "movie-1": { genreIds: [35], runtime: 90 }, "movie-2": { runtime: 90 }, "movie-3": { runtime: 95 }, "movie-4": { runtime: 170 } },
    });
    const { pool } = await buildPairPool(input({ me, fetchers, selection: { ...ANY, vibe: "heavy", time: "120" } }));
    // 1 is a comedy (not heavy); 4 is a 170-minute film that discover let through
    expect(keys(pool)).toEqual(["movie-2", "movie-3"]);
  });

  it("ranks a title both want above one only one wants, above discover", async () => {
    const me: PoolPerson = { entries: [entry("tv", 1), entry("tv", 2)], providerIds: [] };
    const partner: PoolPerson = { entries: [entry("tv", 1)], providerIds: [] };
    const fetchers = fakeFetchers({ discover: { tv: [cand("tv", 3)] } });
    const { pool } = await buildPairPool(input({ me, partner, fetchers }));
    expect(pool.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(pool.map((c) => c.onMyList)).toEqual([true, true, false]);
  });

  it("exposes only rank in pairScore, so a partner's affinity can't be solved for", async () => {
    // Same candidates; one partner loves dramas, the other hates them. The
    // order may change, but the returned numbers depend only on position.
    const drama = (rating: number) =>
      Array.from({ length: 10 }, (_, i) => entry("movie", 600 + i, { status: "WATCHED", rating, genreIds: [18] }));
    const discover = { tv: [cand("tv", 1, { genreIds: [18] }), cand("tv", 2, { genreIds: [35] }), cand("tv", 3, { genreIds: [18, 35] })] };
    const run = (rating: number) =>
      buildPairPool(input({ partner: { entries: drama(rating), providerIds: [] }, fetchers: fakeFetchers({ discover }) }));
    const [loves, hates] = await Promise.all([run(3), run(1)]);
    expect(loves.pool.map((c) => c.id)).not.toEqual(hates.pool.map((c) => c.id));
    expect(loves.pool.map((c) => c.pairScore)).toEqual([1, 0.667, 0.333]);
    expect(hates.pool.map((c) => c.pairScore)).toEqual([1, 0.667, 0.333]);
  });

  it("reports cold start per person and only exposes one pair score", async () => {
    const fetchers = fakeFetchers({ discover: { tv: [cand("tv", 1)] } });
    const r = await buildPairPool(input({ fetchers }));
    expect(r.coldStart).toEqual({ me: true, partner: true });
    expect(Object.keys(r.pool[0])).not.toContain("affinity");
    expect(r.pool[0].pairScore).toBeGreaterThan(0);
  });
});

describe("budget and seeds stay fair (review on #100)", () => {
  // Busy lists: 15 wants and 3 Loves each, every Love with 20 recommendations,
  // and as many matching movies as shows in discover.
  function busyPair() {
    const person = (base: number) => ({
      entries: [
        ...Array.from({ length: 15 }, (_, i) => entry(i % 2 ? "tv" : "movie", base + i)),
        ...Array.from({ length: 3 }, (_, i) =>
          entry(i % 2 ? "tv" : "movie", base + 100 + i, { status: "WATCHED", rating: 3, title: `Love ${base + 100 + i}` })
        ),
      ],
      providerIds: [],
    });
    const me = person(1000);
    const partner = person(2000);
    const recs = Object.fromEntries(
      [...me.entries, ...partner.entries]
        .filter((e) => e.rating === 3)
        .map((e) => [
          candidateKey({ id: e.tmdbId, mediaType: e.mediaType }),
          Array.from({ length: 20 }, (_, i) => cand(e.mediaType, 10_000 + e.tmdbId * 20 + i)),
        ])
    );
    const discover = {
      movie: Array.from({ length: 40 }, (_, i) => cand("movie", 70_000 + i)),
      tv: Array.from({ length: 40 }, (_, i) => cand("tv", 80_000 + i)),
    };
    return { me, partner, recs, discover };
  }
  const isDiscover = (c: { id: number }) => c.id >= 70_000;

  it("keeps discover movies with a time limit when the details budget runs out", async () => {
    // Before the fix: 0 discover movies and 20 discover shows here.
    const { me, partner, recs, discover } = busyPair();
    const { pool } = await buildPairPool(
      input({ me, partner, selection: { ...ANY, time: "120" }, fetchers: fakeFetchers({ recs, discover }) })
    );
    const d = pool.filter(isDiscover);
    const movies = d.filter((c) => c.mediaType === "movie").length;
    expect(movies).toBeGreaterThan(0);
    // blendPools gives an even split for this fake (equal totals) and every
    // runtime fits, so the time limit must not tilt it towards TV.
    expect(Math.abs(movies / d.length - 0.5)).toBeLessThan(0.15);
  });

  it("never returns a movie over the limit, even ones the budget didn't cover (round 2)", async () => {
    const { me, partner, recs, discover } = busyPair();
    // Every third discover movie is really 167 minutes; discover let it through.
    const long = Object.fromEntries(
      discover.movie.filter((_, i) => i % 3 === 0).map((c) => [candidateKey(c), { runtime: 167 }])
    );
    const run = (time: MoodSelection["time"]) => {
      const fetchers = fakeFetchers({ recs, discover, facts: long });
      return buildPairPool(input({ me, partner, selection: { ...ANY, time }, fetchers })).then((r) => ({ r, fetchers }));
    };
    const [any, limited] = await Promise.all([run("any"), run("120")]);

    const runtime = (c: { id: number; mediaType: MediaType }) => (long[candidateKey(c)] ? 167 : 100);
    const movies = limited.r.pool.filter((c) => c.mediaType === "movie");
    expect(movies.length).toBeGreaterThan(0);
    expect(movies.filter((c) => runtime(c) > 120)).toEqual([]);
    // The mix stays comparable to no time limit
    const share = (pool: { mediaType: MediaType }[]) => pool.filter((c) => c.mediaType === "movie").length / pool.length;
    expect(Math.abs(share(limited.r.pool) - share(any.r.pool))).toBeLessThan(0.2);
    // Each title is looked up at most once
    const looked = limited.fetchers.facts.mock.calls.map(([m, id]) => `${m}-${id}`);
    expect(new Set(looked).size).toBe(looked.length);
  });

  it("refills once from the next-ranked titles when violators are dropped", async () => {
    // Movies 1–3 rank top (best rated) but are really too long; 4–8 fit.
    const movies = Array.from({ length: 8 }, (_, i) => cand("movie", i + 1, { voteAverage: 9 - i * 0.3 }));
    const fetchers = fakeFetchers({
      discover: { movie: movies },
      facts: { "movie-1": { runtime: 170 }, "movie-2": { runtime: 150 }, "movie-3": { runtime: 130 } },
    });
    const r = await buildPairPool(input({ fetchers, selection: { ...ANY, time: "120" }, poolSize: 4 }));
    expect(r.pool.map((c) => c.id)).toEqual([4, 5, 6, 7]);
    expect(r.pool.map((c) => c.pairScore)).toEqual([1, 0.75, 0.5, 0.25]);
  });

  it("drops a final-pool movie whose check fails, and flags partial", async () => {
    const fetchers = fakeFetchers({ discover: { movie: [cand("movie", 1), cand("movie", 2)], tv: [cand("tv", 3)] } });
    fetchers.facts.mockImplementation(async (media: MediaType, id: number) => {
      if (id === 2) throw new Error("boom");
      return { id, title: "", posterPath: "/p.jpg", date: "2021-01-01", overview: "", popularity: 1, voteAverage: 7, voteCount: 900, genreIds: [18], runtime: 100, providerIds: [] };
    });
    const r = await buildPairPool(input({ fetchers, selection: { ...ANY, time: "120" } }));
    expect(keys(r.pool)).toEqual(["movie-1", "tv-3"]);
    expect(r.partial).toBe(true);
  });

  it("still drops a discover movie whose real runtime breaks the limit", async () => {
    const fetchers = fakeFetchers({
      discover: { movie: [cand("movie", 1), cand("movie", 2)] },
      facts: { "movie-2": { runtime: 170 } },
    });
    const { pool } = await buildPairPool(input({ fetchers, selection: { ...ANY, time: "120" } }));
    expect(keys(pool)).toEqual(["movie-1"]);
  });

  it.each(["any", "120"] as const)("uses both people's Loves as seeds (time=%s)", async (time) => {
    const { me, partner, recs } = busyPair();
    const { pool } = await buildPairPool(
      input({ me, partner, selection: { ...ANY, time }, fetchers: fakeFetchers({ recs }) })
    );
    const reasons = pool.map((c) => c.reason);
    expect(reasons.some((r) => r.startsWith("Because you loved"))).toBe(true);
    expect(reasons.some((r) => r.startsWith("Because Sam loved"))).toBe(true);
  });
});

describe("posters and partial results", () => {
  it("keeps a title both want even without a poster, but drops other posterless titles", async () => {
    const both = entry("tv", 1, { posterPath: null });
    const me: PoolPerson = { entries: [both, entry("tv", 2, { posterPath: null })], providerIds: [] };
    const partner: PoolPerson = { entries: [{ ...both }], providerIds: [] };
    const fetchers = fakeFetchers({ discover: { tv: [cand("tv", 3, { posterPath: null })] } });
    const { pool } = await buildPairPool(input({ me, partner, fetchers }));
    expect(keys(pool)).toEqual(["tv-1"]);
    expect(pool[0].posterPath).toBeNull();
  });

  it("flags partial results when some TMDB calls failed", async () => {
    const fetchers = fakeFetchers({ discover: { tv: [cand("tv", 1)] } });
    fetchers.discover.mockImplementation(async (media: MediaType) => {
      if (media === "movie") throw new Error("boom");
      return { total: 1, candidates: [cand("tv", 1)] };
    });
    const r = await buildPairPool(input({ fetchers }));
    expect(r.partial).toBe(true);
    expect(r.discoverFailed).toBe(false);
    const ok = await buildPairPool(input({ fetchers: fakeFetchers({ discover: { tv: [cand("tv", 1)] } }) }));
    expect(ok.partial).toBe(false);
  });
});

describe("TMDB caps (§5.2, §6)", () => {
  it("stays within 4 discover calls, 6 rec calls and the details budget", async () => {
    const many = (status: PoolEntry["status"], from: number, n: number, rating: number | null = null) =>
      Array.from({ length: n }, (_, i) => entry(i % 2 ? "tv" : "movie", from + i, { status, rating }));
    const me: PoolPerson = { entries: [...many("WANT_TO_WATCH", 1000, 40), ...many("WATCHED", 3000, 10, 3)], providerIds: [] };
    const partner: PoolPerson = { entries: [...many("WANT_TO_WATCH", 2000, 40), ...many("WATCHED", 4000, 10, 3)], providerIds: [] };
    const recs = Object.fromEntries(
      [...me.entries, ...partner.entries].map((e) => [
        candidateKey({ id: e.tmdbId, mediaType: e.mediaType }),
        Array.from({ length: 20 }, (_, i) => cand(e.mediaType, 5000 + e.tmdbId * 20 + i)),
      ])
    );
    const discover = {
      movie: Array.from({ length: 40 }, (_, i) => cand("movie", 7000 + i)),
      tv: Array.from({ length: 40 }, (_, i) => cand("tv", 8000 + i)),
    };
    const fetchers = fakeFetchers({ recs, discover });

    const r = await buildPairPool(input({ me, partner, fetchers, selection: { ...ANY, time: "120" } }));

    expect(fetchers.discover).toHaveBeenCalledTimes(4);
    expect(fetchers.recommendations.mock.calls.length).toBeLessThanOrEqual(6);
    // Candidate stage within FACTS_BUDGET, plus the final-pool runtime check
    // (at most 2 × pool size, nearly all cache hits); never the same title twice.
    const looked = fetchers.facts.mock.calls.map(([m, id]) => `${m}-${id}`);
    expect(looked.length).toBeLessThanOrEqual(FACTS_BUDGET + 2 * PAIR_POOL_SIZE);
    expect(new Set(looked).size).toBe(looked.length);
    expect(r.pool.length).toBeGreaterThan(0);
    expect(r.pool.length).toBeLessThanOrEqual(60);
  });

  it("makes no details calls when neither time nor services is on", async () => {
    const me: PoolPerson = { entries: [entry("movie", 1), entry("tv", 2)], providerIds: [] };
    const fetchers = fakeFetchers({ discover: { movie: [cand("movie", 3)] } });
    const { pool } = await buildPairPool(input({ me, fetchers }));
    expect(fetchers.facts).not.toHaveBeenCalled();
    expect(keys(pool)).toEqual(["movie-1", "movie-3", "tv-2"]);
  });

  it("keeps going when some TMDB calls fail, and flags when all discover calls did", async () => {
    const onError = vi.fn();
    const fetchers = fakeFetchers();
    fetchers.discover.mockRejectedValue(new Error("boom"));
    const me: PoolPerson = { entries: [entry("tv", 1)], providerIds: [] };
    const r = await buildPairPool(input({ me, fetchers, onError }));
    expect(r.discoverFailed).toBe(true);
    expect(keys(r.pool)).toEqual(["tv-1"]);
    expect(onError).toHaveBeenCalledTimes(4);
  });
});

describe("parsePairPicksQuery", () => {
  const parse = (q: string) => parsePairPicksQuery(new URLSearchParams(q));

  it("defaults missing params and always uses both media types", () => {
    expect(parse("")).toEqual({
      success: true,
      data: { selection: { ...DEFAULT_SELECTION, media: "both" }, sharedOnly: false },
    });
    expect(parse("vibe=light&time=30&fresh=1&services=1&sharedOnly=1&media=movie&utm=x")).toEqual({
      success: true,
      data: { selection: { vibe: "light", time: "30", fresh: true, onMyServices: true, media: "both" }, sharedOnly: true },
    });
  });

  it("rejects invalid or repeated values instead of guessing", () => {
    for (const q of ["vibe=sad", "time=999", "fresh=yes", "services=true", "sharedOnly=2", "media=book", "vibe=light&vibe=heavy"]) {
      expect(parse(q).success, q).toBe(false);
    }
  });
});
