import type { DailyTotals } from "../lib/types";

export function TodaySummary({ today }: { today: DailyTotals | null }) {
  const ratioPct = today ? Math.round(today.junkRatio * 100) : 0;

  return (
    <div className="today-summary">
      <div className="today-summary-header">
        <span>Today</span>
        <span>{ratioPct}% junk</span>
      </div>
      <div className="today-summary-bar">
        <div className="bar-hit" style={{ width: `${ratioPct}%` }} />
        <div className="bar-depth" style={{ width: `${100 - ratioPct}%` }} />
      </div>
      <div className="today-summary-numbers">
        <span>Hit: {today?.hitTotal ?? 0}</span>
        <span>Depth: {today?.depthTotal ?? 0}</span>
      </div>
    </div>
  );
}
