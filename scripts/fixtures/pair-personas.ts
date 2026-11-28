// Synthetic personas for the Watch Together pair eval (spec §9.1).
//
// Every person here is invented: a list of real TMDB titles with the rating
// that persona would give. Nothing comes from a real user, so it is safe to
// commit. Genres are looked up from TMDB when the eval runs, so a fixture only
// needs the media type, TMDB id and rating.
//
// Rating: 3 = Love, 2 = Like, 1 = Didn't like. `want` = on the want-to-watch list.
// `title` is only there so a person can read the file.

export type Media = "movie" | "tv";

export interface PersonaTitle {
  media: Media;
  id: number;
  title: string;
  rating?: 1 | 2 | 3;
  want?: boolean;
}

export interface Persona {
  name: string;
  titles: PersonaTitle[];
}

export interface PersonaPair {
  id: string;
  name: string;
  /** What this pair is checking */
  checks: string;
  a: Persona;
  b: Persona;
}

const m = (id: number, title: string, rating?: 1 | 2 | 3, want = false): PersonaTitle => ({ media: "movie", id, title, rating, want });
const t = (id: number, title: string, rating?: 1 | 2 | 3, want = false): PersonaTitle => ({ media: "tv", id, title, rating, want });

export const PAIRS: PersonaPair[] = [
  {
    id: "similar",
    name: "1. Similar tastes (both love crime dramas)",
    checks: "Easy case: the pool should be strong crime/thriller for both.",
    a: {
      name: "A: crime-drama fan",
      titles: [
        m(807, "Se7en", 3), m(1949, "Zodiac", 3), m(146233, "Prisoners", 3), m(210577, "Gone Girl", 3),
        m(273481, "Sicario", 2), m(2118, "L.A. Confidential", 2),
        t(1396, "Breaking Bad", 3), t(67744, "Mindhunter", 3), t(46648, "True Detective", 3),
        m(508, "Love Actually", 1), t(63351, "Narcos", undefined, true),
      ],
    },
    b: {
      name: "B: crime-drama fan",
      titles: [
        m(949, "Heat", 3), m(1422, "The Departed", 3), m(6977, "No Country for Old Men", 3), m(275, "Fargo", 3),
        m(1538, "Collateral", 2),
        t(60059, "Better Call Saul", 3), t(69740, "Ozark", 3), t(1438, "The Wire", 3),
        m(114, "Pretty Woman", 1), t(63351, "Narcos", undefined, true),
      ],
    },
  },
  {
    id: "complementary",
    name: "2. Complementary tastes (rom-com + sci-fi)",
    checks: "Titles that bridge both (romantic sci-fi, funny sci-fi, character drama) should beat one-sided picks.",
    a: {
      name: "A: rom-com lover",
      titles: [
        m(639, "When Harry Met Sally...", 3), m(455207, "Crazy Rich Asians", 3), m(509, "Notting Hill", 3),
        m(4951, "10 Things I Hate About You", 3), m(122906, "About Time", 3), m(114, "Pretty Woman", 3),
        m(18240, "The Proposal", 2), m(313369, "La La Land", 2), t(67070, "Fleabag", 2),
        m(603, "The Matrix", 1), m(137113, "Edge of Tomorrow", undefined, true),
      ],
    },
    b: {
      name: "B: sci-fi lover",
      titles: [
        m(157336, "Interstellar", 3), m(335984, "Blade Runner 2049", 3), m(329865, "Arrival", 3), m(603, "The Matrix", 3),
        m(264660, "Ex Machina", 3), m(438631, "Dune", 3), m(17431, "Moon", 3), m(27205, "Inception", 2),
        t(42009, "Black Mirror", 3), t(95396, "Severance", 3),
        m(508, "Love Actually", 1), m(114, "Pretty Woman", 1),
      ],
    },
  },
  {
    id: "opposites",
    name: "3. Opposites (horror fan + family-film parent)",
    checks: "Hard case: expect a thin overlap. Misery rate matters more than hit rate here.",
    a: {
      name: "A: horror fan",
      titles: [
        m(493922, "Hereditary", 3), m(419430, "Get Out", 3), m(138843, "The Conjuring", 3), m(447332, "A Quiet Place", 3),
        m(346364, "It", 3), m(530385, "Midsommar", 3), m(242224, "The Babadook", 3),
        m(82507, "Sinister", 2), m(49018, "Insidious", 2),
        m(354912, "Coco", 1), m(568124, "Encanto", 1),
      ],
    },
    b: {
      name: "B: family-film parent",
      titles: [
        m(862, "Toy Story", 3), m(12, "Finding Nemo", 3), m(354912, "Coco", 3), m(277834, "Moana", 3),
        m(346648, "Paddington 2", 3), m(150540, "Inside Out", 3), m(568124, "Encanto", 3), m(808, "Shrek", 3),
        m(14160, "Up", 3), m(269149, "Zootopia", 3), m(9806, "The Incredibles", 2),
        m(493922, "Hereditary", 1), m(530385, "Midsommar", 1), m(49018, "Insidious", 1), m(948, "Halloween", 1),
      ],
    },
  },
  {
    id: "one-cold",
    name: "4. One cold start (rich history + 2 ratings)",
    checks: "The cold-start partner must not drag scores down or leave the pool one-sided.",
    a: {
      name: "A: broad, rich history",
      titles: [
        m(155, "The Dark Knight", 3), m(27205, "Inception", 3), m(157336, "Interstellar", 2), m(680, "Pulp Fiction", 3),
        m(769, "GoodFellas", 3), m(496243, "Parasite", 3), m(244786, "Whiplash", 3), m(13, "Forrest Gump", 2),
        m(105, "Back to the Future", 3), m(278, "The Shawshank Redemption", 3),
        t(76331, "Succession", 3), t(1396, "Breaking Bad", 3), t(97546, "Ted Lasso", 3), t(136315, "The Bear", 2),
      ],
    },
    b: {
      name: "B: just joined (2 ratings)",
      titles: [m(116149, "Paddington", 3), t(125935, "Abbott Elementary", 2)],
    },
  },
  {
    id: "both-cold",
    name: "5. Both cold start",
    checks: "With almost no signal the pool should still be sensible (quality + mood), not random.",
    a: { name: "A: just joined", titles: [m(27205, "Inception", 3), t(1668, "Friends", 2)] },
    b: { name: "B: just joined", titles: [m(98, "Gladiator", 3), t(48891, "Brooklyn Nine-Nine", 2)] },
  },
  {
    id: "movie-tv",
    name: "6. Movie person + TV person",
    checks: "The catalogue must be shared: both types should appear, and neither person's type should be ignored.",
    a: {
      name: "A: only films",
      titles: [
        m(278, "The Shawshank Redemption", 3), m(238, "The Godfather", 3), m(680, "Pulp Fiction", 3), m(496243, "Parasite", 3),
        m(244786, "Whiplash", 3), m(155, "The Dark Knight", 3), m(550, "Fight Club", 3), m(98, "Gladiator", 3),
        m(129, "Spirited Away", 3), m(105, "Back to the Future", 3), m(157336, "Interstellar", 3),
        m(769, "GoodFellas", 2), m(13, "Forrest Gump", 2),
      ],
    },
    b: {
      name: "B: only series",
      titles: [
        t(1396, "Breaking Bad", 3), t(1668, "Friends", 3), t(2316, "The Office", 3), t(8592, "Parks and Recreation", 3),
        t(97546, "Ted Lasso", 3), t(66732, "Stranger Things", 3), t(76331, "Succession", 3), t(95396, "Severance", 3),
        t(136315, "The Bear", 3), t(48891, "Brooklyn Nine-Nine", 3), t(100088, "The Last of Us", 3), t(125935, "Abbott Elementary", 3),
        t(67070, "Fleabag", 2), t(42009, "Black Mirror", 2), t(107113, "Only Murders in the Building", 2),
      ],
    },
  },
  {
    id: "true-story",
    name: "7. Prestige true-story drama pair (the owner's feedback, #193)",
    checks:
      "Both love true-story dramas (The Social Network is the shared Love). Trumbo and Beautiful Boy should reach the grid; If I Stay, Creed III, MobLand, Minions & Monsters and The Shadow's Edge should not. Scored by LABELS below.",
    a: {
      name: "A: true-story dramas, no franchise action",
      titles: [
        m(37799, "The Social Network", 3), m(60308, "Moneyball", 3), m(314365, "Spotlight", 3), t(76331, "Succession", 3),
        t(65494, "The Crown", 2), m(318846, "The Big Short", 2), m(385687, "Fast X", 1), m(840430, "The Holdovers", undefined, true),
      ],
    },
    b: {
      name: "B: literate dramas, no violent crime",
      titles: [
        m(37799, "The Social Network", 3), m(331482, "Little Women", 3), m(492188, "Marriage Story", 3), t(89905, "Normal People", 3),
        t(97546, "Ted Lasso", 2), m(391713, "Lady Bird", 2), t(60574, "Peaky Blinders", 1), m(245891, "John Wick", 1),
        m(666277, "Past Lives", undefined, true),
      ],
    },
  },
];
