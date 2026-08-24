import type { ActivityType, LogEntry } from "../lib/types";
import { deleteLogEntry } from "../lib/db";

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
    return <div className="recent-entries-empty">Nothing logged yet today.</div>;
  }

  return (
    <div className="recent-entries">
      <div className="recent-entries-label">Recent</div>
      {entries.map((entry) => {
        const activityType = activityTypes.find((t) => t.id === entry.activityTypeId);
        return (
          <div key={entry.id} className="recent-entry-row">
            <span>
              {activityType?.name ?? "Unknown"} · {entry.durationMinutes}min
            </span>
            <button aria-label="Delete entry" onClick={() => handleDelete(entry.id)}>
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}
