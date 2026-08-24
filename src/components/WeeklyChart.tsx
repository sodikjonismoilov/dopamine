import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import type { DailyTotals } from "../lib/types";

export function WeeklyChart({ days }: { days: DailyTotals[] }) {
  const chartData = days.map((d) => ({
    label: new Date(d.dateKey).toLocaleDateString("en-US", { weekday: "short" }),
    ratio: Math.round(d.junkRatio * 100),
  }));

  return (
    <div className="weekly-chart">
      <div className="weekly-chart-label">Last 7 days</div>
      <ResponsiveContainer width="100%" height={70}>
        <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, 100]} />
          <Bar dataKey="ratio" radius={[3, 3, 0, 0]} fill="#D85A30" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
