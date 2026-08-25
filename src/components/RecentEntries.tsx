import { useMemo, useState } from "react";
import type { ActivityType, LogEntry } from "../lib/types";
import { deleteLogEntry } from "../lib/db";
import { isHitDominant } from "../lib/scoring";
import { ChevronIcon, CloseIcon } from "./icons";

interface Props {
  entries: LogEntry[];
  activityTypes: ActivityType[];
  onChanged: () => void;
}

interface DayGroup {
  dateKey: string;
  label: string;
  entries: LogEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA"); // YYYY-MM-DD, local time
}

/** "Aug 23" for a "YYYY-MM-DD" key. Built from local y/m/d components rather
 * than `new Date(dateKey)`, which parses as UTC midnight and can land on
 * the wrong day once converted back to local time. */
function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/** Buckets entries by local calendar day, most recent day first, newest
 * entry first within each day -- same grouping Claude desktop's sidebar
 * uses for history, so each day can be collapsed independently. */
function groupByDay(entries: LogEntry[]): DayGroup[] {
  const todayKey = localDateKey(Date.now());
  const yesterdayKey = localDateKey(Date.now() - DAY_MS);

  const byDate = new Map<string, LogEntry[]>();
  for (const entry of entries) {
    const key = localDateKey(entry.timestampMs);
    const bucket = byDate.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      byDate.set(key, [entry]);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayEntries]) => ({
      dateKey,
      label:
        dateKey === todayKey ? "Today" : dateKey === yesterdayKey ? "Yesterday" : formatDateLabel(dateKey),
      entries: [...dayEntries].sort((a, b) => b.timestampMs - a.timestampMs),
    }));
}

export function RecentEntries({ entries, activityTypes, onChanged }: Props) {
  const groups = useMemo(() => groupByDay(entries), [entries]);
  const todayKey = useMemo(() => localDateKey(Date.now()), []);
  // Today starts open, every earlier day starts collapsed -- same as the
  // Claude desktop sidebar only auto-expanding the most recent bucket.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set([todayKey]));

  function toggleDay(dateKey: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }

  async function handleDelete(id: number) {
    await deleteLogEntry(id);
    onChanged();
  }

  if (entries.length === 0) {
    return (
      <div className="recent-entries-empty">
        <div className="recent-entries-empty-icon">
          <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 13V6a2 2 0 0 1 2-2h2l1.4-1.6h1.2L10 4h2a2 2 0 0 1 2 2v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
            <circle cx="8" cy="8.5" r="2.5" />
          </svg>
        </div>
        <span className="recent-entries-empty-title">Nothing logged yet today</span>
        <span className="recent-entries-empty-subtitle">
          Whatever you do next — log it above and the picture starts filling in.
        </span>
      </div>
    );
  }

  return (
    <div className="recent-entries">
      <div className="recent-entries-label">Recent</div>
      {groups.map((group) => {
        const isOpen = expandedDays.has(group.dateKey);
        return (
          <div className="recent-day-group" key={group.dateKey}>
            <button
              type="button"
              className="recent-day-header"
              onClick={() => toggleDay(group.dateKey)}
              aria-expanded={isOpen}
            >
              <ChevronIcon size={9} className={`recent-day-chevron${isOpen ? " is-open" : ""}`} />
              <span className="recent-day-label">{group.label}</span>
              <span className="recent-day-count">{group.entries.length}</span>
            </button>

            {isOpen && (
              <div className="recent-day-entries">
                {group.entries.map((entry) => {
                  const activityType = activityTypes.find((t) => t.id === entry.activityTypeId);
                  const dotClass = activityType && isHitDominant(activityType) ? "hit-icon" : "depth-icon";
                  return (
                    <div key={entry.id} className="recent-entry-row">
                      <div className="recent-entry-info">
                        <span className={`recent-entry-dot ${dotClass}`} style={{ background: "currentColor" }} />
                        <span className="recent-entry-name">{activityType?.name ?? "Unknown"}</span>
                        <span className="recent-entry-sep">&middot;</span>
                        <span className="recent-entry-duration">{entry.durationMinutes}m</span>
                      </div>
                      <button aria-label="Delete entry" onClick={() => handleDelete(entry.id)}>
                        <CloseIcon size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
