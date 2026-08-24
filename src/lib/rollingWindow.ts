import { junkRatio } from "./scoring";
import type { LogEntry } from "./types";

const WINDOW_MS = 45 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000;
const TRIGGER_RATIO = 0.65;

export interface NudgeState {
  lastNudgeAtMs: number | null;
}

/** Returns true if a nudge should fire right now, given recent entries and
 * when the last nudge went out. Call this after every new log entry. */
export function shouldNudge(
  entries: LogEntry[],
  nowMs: number,
  state: NudgeState
): boolean {
  if (state.lastNudgeAtMs !== null && nowMs - state.lastNudgeAtMs < COOLDOWN_MS) {
    return false;
  }

  const windowStart = nowMs - WINDOW_MS;
  const windowEntries = entries.filter((e) => e.timestampMs >= windowStart && e.timestampMs <= nowMs);

  if (windowEntries.length === 0) return false; // no data, nothing to judge

  const hitTotal = windowEntries.reduce((sum, e) => sum + e.hitScore, 0);
  const depthTotal = windowEntries.reduce((sum, e) => sum + e.depthScore, 0);

  return junkRatio(hitTotal, depthTotal) > TRIGGER_RATIO;
}
