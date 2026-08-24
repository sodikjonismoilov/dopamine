// Default activity_types seed data.
// Rates are points per 10 minutes. Users can edit hitRate/depthRate later;
// defaultHitRate/defaultDepthRate stay fixed so "reset to default" works
// without a separate hardcoded lookup table.
//
// avgUnitDurationMin backs count-based logging ("10 songs" -> 35 min).
// null means the activity is only ever logged by explicit duration.

export interface TaxonomySeed {
  name: string;
  aliases: string[];
  hitRate: number;
  depthRate: number;
  avgUnitDurationMin: number | null;
}

export const DEFAULT_TAXONOMY: TaxonomySeed[] = [
  {
    name: "Short-form video",
    aliases: ["tiktok", "reels", "shorts", "short form", "short-form"],
    hitRate: 8,
    depthRate: 1,
    avgUnitDurationMin: null,
  },
  {
    name: "Social feed",
    aliases: ["insta", "instagram", "twitter", "x.com", "scrolling", "scrolled", "feed"],
    hitRate: 7,
    depthRate: 1,
    avgUnitDurationMin: null,
  },
  {
    name: "Gaming",
    aliases: ["gaming", "game", "gamed", "played"],
    hitRate: 6,
    depthRate: 3,
    avgUnitDurationMin: null,
  },
  {
    name: "YouTube",
    aliases: ["youtube", "yt", "video essay"],
    hitRate: 5,
    depthRate: 3,
    avgUnitDurationMin: null,
  },
  {
    name: "Movies & TV",
    aliases: ["movie", "film", "tv", "show", "episode", "episodes", "series"],
    hitRate: 4,
    depthRate: 3,
    avgUnitDurationMin: 22, // per episode, for count-based logging
  },
  {
    name: "Socializing",
    aliases: ["hung out", "hangout", "friends", "socializing", "coffee with", "dinner with"],
    hitRate: 4,
    depthRate: 6,
    avgUnitDurationMin: null,
  },
  {
    name: "Music",
    aliases: ["music", "song", "songs", "listened", "playlist", "spotify"],
    hitRate: 3,
    depthRate: 2,
    avgUnitDurationMin: 3.5, // per song, for count-based logging
  },
  {
    name: "Reading",
    aliases: ["read", "reading", "book", "chapter", "chapters", "article"],
    hitRate: 2,
    depthRate: 7,
    avgUnitDurationMin: 15, // per chapter, for count-based logging
  },
  {
    name: "Exercise",
    aliases: ["walk", "walked", "run", "ran", "gym", "workout", "exercise", "exercised"],
    hitRate: 2,
    depthRate: 8,
    avgUnitDurationMin: null,
  },
  {
    name: "Meditation",
    aliases: ["meditate", "meditated", "meditation", "breathwork"],
    hitRate: 1,
    depthRate: 6,
    avgUnitDurationMin: null,
  },
  {
    name: "Deep work",
    aliases: ["coding", "coded", "deep work", "studying", "studied", "writing", "wrote"],
    hitRate: 1,
    depthRate: 8,
    avgUnitDurationMin: null,
  },
];

// Words stripped before alias matching — they carry no signal and can
// cause false negatives if left in (e.g. "watched" alone shouldn't match).
export const PARSER_STOPWORDS = [
  "i",
  "just",
  "kinda",
  "sorta",
  "some",
  "a",
  "an",
  "the",
  "of",
  "for",
  "about",
  "around",
  "like",
  "right now",
  "watched",
  "did",
  "was",
  "some",
];
