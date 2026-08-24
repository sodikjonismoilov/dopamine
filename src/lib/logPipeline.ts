import { insertLogEntry } from "./db";
import { parseWithLlmFallback } from "./llmFallback";
import { parseLocally } from "./parser";
import { shouldNudge, type NudgeState } from "./rollingWindow";
import { scoreEntry } from "./scoring";
import type { ActivityType, LogEntry, ParsedEntry } from "./types";

export interface LogResult {
  parsed: ParsedEntry;
  needsConfirmation: boolean; // true => show the confirm/edit UI instead of instant-saving
  savedEntryId?: number; // set once actually persisted
}

/** Step 1: parse only, no save. The caller decides whether to show a
 * confirm step based on `needsConfirmation` before calling `commitEntry`. */
export async function parseEntry(
  rawText: string,
  activityTypes: ActivityType[]
): Promise<LogResult> {
  const local = parseLocally(rawText, activityTypes);

  if (local.parsed) {
    return { parsed: local.parsed, needsConfirmation: false };
  }

  const fallback = await parseWithLlmFallback(rawText, activityTypes);
  if (!fallback) {
    throw new Error(
      "Couldn't parse that entry, even with the fallback. Falling through to manual entry UI."
    );
  }

  return { parsed: fallback, needsConfirmation: true };
}

/** Step 2: actually persist a parsed (and possibly user-edited) entry. */
export async function commitEntry(
  rawText: string,
  parsed: ParsedEntry,
  activityType: Pick<ActivityType, "hitRate" | "depthRate">,
  source: "manual" | "auto" = "manual"
): Promise<number> {
  const { hitScore, depthScore } = scoreEntry(parsed.durationMinutes, activityType);
  const timestampMs = Date.now();

  return insertLogEntry({
    timestampMs,
    rawText,
    activityTypeId: parsed.activityTypeId,
    durationMinutes: parsed.durationMinutes,
    hitScore,
    depthScore,
    source,
  });
}

/** Call after a successful commit to check whether the rolling-window
 * nudge should fire. Caller owns persisting `nudgeState.lastNudgeAtMs`
 * (e.g. in a small local store) once a nudge is shown. */
export function checkNudge(recentEntries: LogEntry[], nudgeState: NudgeState): boolean {
  return shouldNudge(recentEntries, Date.now(), nudgeState);
}
