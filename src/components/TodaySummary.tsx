import type { DailyTotals } from "../lib/types";
import { BoltIcon, LeafIcon } from "./icons";

export function TodaySummary({ today }: { today: DailyTotals | null }) {
  const hasEntries = !!today && today.hitTotal + today.depthTotal > 0;
  const ratioPct = today ? Math.round(today.junkRatio * 100) : 0;

  return (
    <div className="today-summary">
      <div className="today-summary-header">
        <span>Today</span>
        <span className="today-summary-count">{hasEntries ? `${ratioPct}% junk` : "Nothing yet"}</span>
      </div>

      {hasEntries ? (
        <div className="today-summary-meter">
          <div className="today-summary-marker" style={{ left: `${ratioPct}%` }}>
            <span className="today-summary-marker-chip">{ratioPct}%</span>
          </div>
          <div className="today-summary-track-row">
            <BoltIcon size={13} className="hit-icon" />
            <div className="today-summary-track">
              <div className="today-summary-track-fill" style={{ width: `${ratioPct}%` }} />
            </div>
            <LeafIcon size={13} className="depth-icon" />
          </div>
        </div>
      ) : (
        <div className="today-summary-track-row today-summary-track-row-empty">
          <BoltIcon size={13} className="hit-icon" />
          <div className="today-summary-track">
            <div className="today-summary-track-empty" />
          </div>
          <LeafIcon size={13} className="depth-icon" />
        </div>
      )}

      {hasEntries && (
        <div className="today-summary-stats">
          <div className="today-summary-stat is-hit">
            <BoltIcon size={11} />
            <span>Hit</span>
            <span className="today-summary-stat-value">{today?.hitTotal ?? 0}</span>
          </div>
          <div className="today-summary-stat is-depth">
            <LeafIcon size={11} />
            <span>Depth</span>
            <span className="today-summary-stat-value">{today?.depthTotal ?? 0}</span>
          </div>
        </div>
      )}
    </div>
  );
}
