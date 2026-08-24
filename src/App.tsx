import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import "./App.css";
import { QuickAdd } from "./components/QuickAdd";
import { RecentEntries } from "./components/RecentEntries";
import { TodaySummary } from "./components/TodaySummary";
import { WeeklyChart } from "./components/WeeklyChart";
import { SlidersIcon } from "./components/icons";
import { getActivityTypes, getEntriesSince, getRecentEntries, initDb } from "./lib/db";
import { checkNudge } from "./lib/logPipeline";
import type { NudgeState } from "./lib/rollingWindow";
import { aggregateByDay, bandForRatio } from "./lib/scoring";
import type { ActivityType, DailyTotals, LogEntry } from "./lib/types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function App() {
  const [ready, setReady] = useState(false);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [weekEntries, setWeekEntries] = useState<LogEntry[]>([]);
  const [recentEntries, setRecentEntries] = useState<LogEntry[]>([]);
  const [nudgeState] = useState<NudgeState>({ lastNudgeAtMs: null });

  const refresh = useCallback(async () => {
    const since = Date.now() - SEVEN_DAYS_MS;
    const [entries, recent] = await Promise.all([getEntriesSince(since), getRecentEntries(8)]);
    setWeekEntries(entries);
    setRecentEntries(recent);

    // Keep the tray icon's color in sync with today's band.
    const today = aggregateByDay(entries).find(
      (d) => d.dateKey === new Date().toLocaleDateString("en-CA")
    );
    const band = bandForRatio(today?.junkRatio ?? 0);
    invoke("set_tray_icon_state", { band }).catch(() => {
      // Fine to no-op in a plain browser preview (npm run dev without `tauri dev`)
    });

    if (checkNudge(entries, nudgeState)) {
      nudgeState.lastNudgeAtMs = Date.now();
      invoke("send_nudge_notification", {
        message: "Heavy on quick-hit content -- 10 min walk?",
      }).catch(() => {});
    }
  }, [nudgeState]);

  useEffect(() => {
    (async () => {
      await initDb();
      setActivityTypes(await getActivityTypes());
      await refresh();
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return <div className="loading">Loading...</div>;
  }

  const dailyTotals: DailyTotals[] = aggregateByDay(weekEntries);
  const todayKey = new Date().toLocaleDateString("en-CA");
  const today = dailyTotals.find((d) => d.dateKey === todayKey) ?? null;

  return (
    <div className="popover">
      <QuickAdd activityTypes={activityTypes} onLogged={refresh} />
      <TodaySummary today={today} />
      <WeeklyChart days={dailyTotals} />
      <RecentEntries entries={recentEntries} activityTypes={activityTypes} onChanged={refresh} />
      <button className="settings-link" onClick={() => invoke("open_settings_window")}>
        <SlidersIcon size={13} />
        Settings
      </button>
    </div>
  );
}

export default App;
