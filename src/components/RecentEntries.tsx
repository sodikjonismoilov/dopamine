import type { ActivityType, LogEntry } from "../lib/types";
import { deleteLogEntry } from "../lib/db";
import { isHitDominant } from "../lib/scoring";
import { CloseIcon } from "./icons";

interface Props {
  entries: LogEntry[];
  activityTypes: ActivityType[];
  onChanged: () => void;
}

export function RecentEntries({ entries, activityTypes, onChanged }: Props) {
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
      {entries.map((entry) => {
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
  );
}
