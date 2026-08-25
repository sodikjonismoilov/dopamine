import Database from "@tauri-apps/plugin-sql";
import { DEFAULT_TAXONOMY } from "./taxonomy";
import type { ActivitySource, ActivityType, LogEntry } from "./types";

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:dopamine.db");
  }
  return dbInstance;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS activity_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL,           -- JSON array
  hit_rate REAL NOT NULL,
  depth_rate REAL NOT NULL,
  default_hit_rate REAL NOT NULL,
  default_depth_rate REAL NOT NULL,
  avg_unit_duration_min REAL       -- nullable
);

CREATE TABLE IF NOT EXISTS log_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp_ms INTEGER NOT NULL,
  raw_text TEXT NOT NULL,
  activity_type_id INTEGER NOT NULL REFERENCES activity_types(id),
  duration_minutes REAL NOT NULL,
  hit_score REAL NOT NULL,
  depth_score REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp_ms);
`;

/** Creates tables (if needed) and seeds the default taxonomy on first run
 * only — existing rows, including any user edits to hit_rate/depth_rate,
 * are left untouched. */
export async function initDb(): Promise<void> {
  const db = await getDb();
  for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    await db.execute(statement);
  }

  const [{ count }] = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM activity_types"
  );

  if (count === 0) {
    for (const seed of DEFAULT_TAXONOMY) {
      await db.execute(
        `INSERT INTO activity_types
          (name, aliases, hit_rate, depth_rate, default_hit_rate, default_depth_rate, avg_unit_duration_min)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          seed.name,
          JSON.stringify(seed.aliases),
          seed.hitRate,
          seed.depthRate,
          seed.hitRate,
          seed.depthRate,
          seed.avgUnitDurationMin,
        ]
      );
    }
  }
}

function rowToActivityType(row: any): ActivityType {
  return {
    id: row.id,
    name: row.name,
    aliases: JSON.parse(row.aliases),
    hitRate: row.hit_rate,
    depthRate: row.depth_rate,
    defaultHitRate: row.default_hit_rate,
    defaultDepthRate: row.default_depth_rate,
    avgUnitDurationMin: row.avg_unit_duration_min,
  };
}

export async function getActivityTypes(): Promise<ActivityType[]> {
  const db = await getDb();
  const rows = await db.select<any[]>("SELECT * FROM activity_types ORDER BY id");
  return rows.map(rowToActivityType);
}

/** Rate edits only — categories themselves are fixed for v1 (see design notes). */
export async function updateActivityTypeRates(
  id: number,
  hitRate: number,
  depthRate: number
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE activity_types SET hit_rate = ?, depth_rate = ? WHERE id = ?", [
    hitRate,
    depthRate,
    id,
  ]);
}

export async function resetActivityTypeRate(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE activity_types SET hit_rate = default_hit_rate, depth_rate = default_depth_rate WHERE id = ?",
    [id]
  );
}

export async function insertLogEntry(entry: {
  timestampMs: number;
  rawText: string;
  activityTypeId: number;
  durationMinutes: number;
  hitScore: number;
  depthScore: number;
  source: ActivitySource;
}): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO log_entries
      (timestamp_ms, raw_text, activity_type_id, duration_minutes, hit_score, depth_score, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.timestampMs,
      entry.rawText,
      entry.activityTypeId,
      entry.durationMinutes,
      entry.hitScore,
      entry.depthScore,
      entry.source,
    ]
  );
  return result.lastInsertId ?? -1;
}

export async function deleteLogEntry(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM log_entries WHERE id = ?", [id]);
}

function rowToLogEntry(row: any): LogEntry {
  return {
    id: row.id,
    timestampMs: row.timestamp_ms,
    rawText: row.raw_text,
    activityTypeId: row.activity_type_id,
    durationMinutes: row.duration_minutes,
    hitScore: row.hit_score,
    depthScore: row.depth_score,
    source: row.source,
  };
}

export async function getEntriesSince(timestampMs: number): Promise<LogEntry[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    "SELECT * FROM log_entries WHERE timestamp_ms >= ? ORDER BY timestamp_ms",
    [timestampMs]
  );
  return rows.map(rowToLogEntry);
}
