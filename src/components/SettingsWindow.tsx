import { getActivityTypes, initDb, updateActivityTypeRates, resetActivityTypeRate } from "../lib/db";
import { useEffect, useState } from "react";

import { ActivityType } from "../lib/types";


export function SettingsWindow() {
    const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [savedId, setSavedId] = useState<number | null>(null);

    useEffect(() => {
        (async () => {
            await initDb(); 
            setActivityTypes(await getActivityTypes());
            setLoaded(true);
        })();
    }, []);

    function updateLocalRate(id: number, field: "hitRate" | "depthRate", value: number) {
        setActivityTypes((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value} : t)));
    }

    async function saveRow(activityType: ActivityType) {
        await updateActivityTypeRates(activityType.id, activityType.hitRate, activityType.depthRate);
        setSavedId(activityType.id);
        setTimeout(() => setSavedId((cur) => (cur === activityType.id ? null : cur)), 1200);
    }

    async function resetRow(id: number) {
        await resetActivityTypeRate(id);
        setActivityTypes(await getActivityTypes());
    }

    if (!loaded) {
        return <div className="settings-loading">Loading...</div>;
    }

    return (
        <div className="settings-window">
            <h1>Activity rates</h1>
            <p className="settings-subtitle">
                Points per 10 minutes. Hit is immediate-reward intensity, depth is sustained value.
                Categories are fixed for now - only the numbers are yours to tune.
            </p>

            <div className="settings-table">
                <div className="settings-row settings-header">
                    <span>Activity</span>
                    <span>Hit</span>
                    <span>Depth</span>
                    <span></span>
                </div>

                 {activityTypes.map((type) => {
                    const isDefault =
                        type.hitRate === type.defaultHitRate && type.depthRate === type.defaultDepthRate;

                    return (
            <div className="settings-row" key={type.id}>
              <span className="settings-name">{type.name}</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={type.hitRate}
                onChange={(e) => updateLocalRate(type.id, "hitRate", parseFloat(e.target.value))}
                onBlur={() => saveRow(type)}
              />
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={type.depthRate}
                onChange={(e) => updateLocalRate(type.id, "depthRate", parseFloat(e.target.value))}
                onBlur={() => saveRow(type)}
              />
              <div className="settings-row-actions">
                {savedId === type.id && <span className="saved-indicator">Saved</span>}
                <button
                  className="reset-btn"
                  disabled={isDefault}
                  onClick={() => resetRow(type.id)}
                  title="Reset to default"
                >
                  Reset
                </button>
              </div>
            </div>
          );
                })}
            </div>
        </div>
    );
}