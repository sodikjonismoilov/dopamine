// Core types — mirror the SQLite schema in db.ts

export type ActivitySource = "manual" | "auto";

export interface ActivityType {
  id: number;
  name: string;
  aliases: string[];
  hitRate: number; // points per 10 min, user-editable
  depthRate: number; // points per 10 min, user-editable
  defaultHitRate: number; // immutable, used for "reset to default"
  defaultDepthRate: number;
  avgUnitDurationMin: number | null; // for count-based logging ("10 songs"); null if not applicable
}

export interface LogEntry {
  id: number;
  timestampMs: number;
  rawText: string;
  activityTypeId: number;
  durationMinutes: number;
  hitScore: number; // snapshotted at log time — never recomputed live
  depthScore: number; // snapshotted at log time
  source: ActivitySource;
}

export interface ParsedEntry {
  activityTypeId: number;
  durationMinutes: number;
  confidence: "high" | "low"; // "low" triggers the confirm-before-save step
  usedLlmFallback: boolean;
}

export interface DailyTotals {
  dateKey: string; // YYYY-MM-DD, local time
  hitTotal: number;
  depthTotal: number;
  junkRatio: number; // hitTotal / (hitTotal + depthTotal), 0 when no entries
}
