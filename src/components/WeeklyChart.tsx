import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { DailyTotals } from "../lib/types";

export function WeeklyChart({ days }: { days: DailyTotals[] }) {
  const chartData = days.map((d) => {
    const ratio = Math.round(d.junkRatio * 100);
    // dateKey is a local "YYYY-MM-DD" string. `new Date(d.dateKey)` would
    // parse that as UTC midnight, which shifts to the previous day once
    // rendered back in a UTC-negative timezone -- off by one on the label.
    // Building the Date from local y/m/d components instead keeps it in
    // local time throughout.
    const [year, month, day] = d.dateKey.split("-").map(Number);
    return {
      label: new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "short" }),
      junk: ratio,
      rest: 100 - ratio,
    };
  });

  return (
    <div className="weekly-chart">
      <div className="weekly-chart-label">Last 7 days</div>
      <ResponsiveContainer width="100%" height={64}>
        <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9b968c" }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, 100]} />
          <Bar dataKey="junk" stackId="ratio" fill="#D2603A" radius={[0, 0, 0, 0]} />
          <Bar dataKey="rest" stackId="ratio" fill="#DFEFE8" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
