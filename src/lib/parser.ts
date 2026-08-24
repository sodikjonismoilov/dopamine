import { PARSER_STOPWORDS } from "./taxonomy";
import type { ActivityType, ParsedEntry } from "./types";

// ---- Duration extraction --------------------------------------------------

// Matches explicit time: "20 mins", "2h", "30min", "1 hour", "45 minutes"
const EXPLICIT_TIME_RE =
  /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i;

// Matches counts: "10 songs", "3 episodes", "2 chapters"
const COUNT_RE = /(\d+)\s*(songs?|episodes?|chapters?|videos?)\b/i;

function extractExplicitMinutes(text: string): number | null {
  const match = text.match(EXPLICIT_TIME_RE);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  const isHours = unit.startsWith("h");
  return isHours ? value * 60 : value;
}

function extractCount(text: string): { count: number; unitWord: string } | null {
  const match = text.match(COUNT_RE);
  if (!match) return null;
  return { count: parseInt(match[1], 10), unitWord: match[2].toLowerCase() };
}

// ---- Activity matching ------------------------------------------------

function normalize(text: string): string {
  let out = text.toLowerCase().replace(/[.,!?]/g, " ");
  for (const stop of PARSER_STOPWORDS) {
    out = out.replace(new RegExp(`\\b${stop}\\b`, "g"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

interface AliasMatch {
  activityType: ActivityType;
  matchedAlias: string;
}

function findAliasMatches(normalizedText: string, activityTypes: ActivityType[]): AliasMatch[] {
  const matches: AliasMatch[] = [];
  for (const type of activityTypes) {
    for (const alias of type.aliases) {
      if (normalizedText.includes(alias.toLowerCase())) {
        matches.push({ activityType: type, matchedAlias: alias });
        break; // one match per activity type is enough
      }
    }
  }
  return matches;
}

// ---- Main entry point ---------------------------------------------------

export interface LocalParseResult {
  parsed: ParsedEntry | null; // null means "rules failed, needs LLM fallback"
  reason?: "no_activity_match" | "ambiguous_activity_match" | "no_duration_found";
}

export function parseLocally(rawText: string, activityTypes: ActivityType[]): LocalParseResult {
  const normalized = normalize(rawText);
  const aliasMatches = findAliasMatches(normalized, activityTypes);

  if (aliasMatches.length === 0) {
    return { parsed: null, reason: "no_activity_match" };
  }
  if (aliasMatches.length > 1) {
    return { parsed: null, reason: "ambiguous_activity_match" };
  }

  const matchedType = aliasMatches[0].activityType;

  // Try explicit duration first, then fall back to count-based conversion.
  let durationMinutes = extractExplicitMinutes(normalized);
  if (durationMinutes === null) {
    const countMatch = extractCount(normalized);
    if (countMatch && matchedType.avgUnitDurationMin != null) {
      durationMinutes = countMatch.count * matchedType.avgUnitDurationMin;
    }
  }

  if (durationMinutes === null) {
    return { parsed: null, reason: "no_duration_found" };
  }

  return {
    parsed: {
      activityTypeId: matchedType.id,
      durationMinutes: Math.round(durationMinutes * 10) / 10,
      confidence: "high",
      usedLlmFallback: false,
    },
  };
}
