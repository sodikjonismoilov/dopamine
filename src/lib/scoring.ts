import type { ActivityType, DailyTotals, LogEntry } from "./types";

/** Computes hit/depth scores for a single entry. Called once, at log time —
 * the results are stored on the entry and never recalculated, even if the
 * activity type's rates are edited later. See db.ts for why. */
export function scoreEntry(
  durationMinutes: number,
  activityType: Pick<ActivityType, "hitRate" | "depthRate">
): { hitScore: number; depthScore: number } {
  const units = durationMinutes / 10;
  return {
    hitScore: Math.round(units * activityType.hitRate * 10) / 10,
    depthScore: Math.round(units * activityType.depthRate * 10) / 10,
  };
}

export function junkRatio(hitTotal: number, depthTotal: number): number {
  const total = hitTotal + depthTotal;
  if (total === 0) return 0;
  return Math.round((hitTotal / total) * 1000) / 1000;
}

/** Groups entries by local date and sums hit/depth per day. */
export function aggregateByDay(entries: LogEntry[]): DailyTotals[] {
  const byDate = new Map<string, { hitTotal: number; depthTotal: number }>();

  for (const entry of entries) {
    const dateKey = new Date(entry.timestampMs).toLocaleDateString("en-CA"); // YYYY-MM-DD
    const existing = byDate.get(dateKey) ?? { hitTotal: 0, depthTotal: 0 };
    existing.hitTotal += entry.hitScore;
    existing.depthTotal += entry.depthScore;
    byDate.set(dateKey, existing);
  }

  return Array.from(byDate.entries())
    .map(([dateKey, totals]) => ({
      dateKey,
      hitTotal: Math.round(totals.hitTotal * 10) / 10,
      depthTotal: Math.round(totals.depthTotal * 10) / 10,
      junkRatio: junkRatio(totals.hitTotal, totals.depthTotal),
    }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/** State band for the tray icon color. */
export type StateBand = "green" | "amber" | "red";

export function bandForRatio(ratio: number): StateBand {
  if (ratio < 0.4) return "green";
  if (ratio < 0.7) return "amber";
  return "red";
}
