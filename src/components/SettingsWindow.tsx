import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { getActivityTypes, initDb, resetActivityTypeRate, updateActivityTypeRates } from "../lib/db";
import type { ActivityType } from "../lib/types";
import { isHitDominant } from "../lib/scoring";
import { CheckIcon, ResetIcon, SlidersIcon } from "./icons";
import "./SettingsWindow.css";

function ApiKeySection() {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () => invoke<boolean>("has_api_key").then(setHasKey);

  useEffect(() => {
    refresh();
  }, []);

  async function handleSave() {
    if (!input.trim()) return;
    setError(null);
    try {
    await invoke("save_api_key", { key: input.trim() });
    setInput(""); // never echo the key back once saved
    setStatus("Saved");
    setTimeout(() => setStatus(null), 1500);
    refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete() {
    setError(null);
    try {
    await invoke("delete_api_key");
    refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="api-key-section">
      <h2>Google API key</h2>
      <p className="settings-subtitle">
        Only used as a fallback when the local parser can't confidently read an entry (via
        Gemini's free tier). Stored in macOS Keychain — never touches this window's JS or gets
        logged anywhere.
      </p>

      <div className="api-key-status">
        {hasKey === null ? "Checking…" : hasKey ? "Key is saved." : "No key saved yet."}
      </div>

      <div className="api-key-row">
        <input
          type="password"
          placeholder={hasKey ? "Replace key…" : "Paste your API key…"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button onClick={handleSave} disabled={!input.trim()}>
          Save
        </button>
        {hasKey && (
          <button className="reset-btn" onClick={handleDelete}>
            Remove
          </button>
        )}
      </div>
      {status && <div className="saved-indicator">{status}</div>}
      {error && <div className="api-key-error">{error}</div>}
    </div>
  );
}

export function SettingsWindow() {
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      await initDb(); // idempotent — safe to call again in this window's own JS runtime
      setActivityTypes(await getActivityTypes());
      setLoaded(true);
    })();
  }, []);

  function updateLocalRate(id: number, field: "hitRate" | "depthRate", value: number) {
    setActivityTypes((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
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
    return <div className="settings-loading">Loading…</div>;
  }

  return (
    <div className="settings-window">
      <div className="settings-title-row">
        <SlidersIcon size={16} className="hit-icon" />
        <h1>Activity rates</h1>
      </div>
      <p className="settings-subtitle">
        Points per 10 minutes. <span className="hit-icon settings-emphasis">Hit</span> is
        immediate-reward intensity, <span className="depth-icon settings-emphasis">depth</span> is
        sustained value. Categories are fixed for now — only the numbers are yours to tune.
      </p>

      <div className="settings-table">
        <div className="settings-row settings-header">
          <span>Activity</span>
          <span className="hit-icon">Hit</span>
          <span className="depth-icon">Depth</span>
          <span></span>
        </div>

        {activityTypes.map((type) => {
          const isDefault =
            type.hitRate === type.defaultHitRate && type.depthRate === type.defaultDepthRate;
          const dotClass = isHitDominant(type) ? "hit-icon" : "depth-icon";

          return (
            <div className="settings-row" key={type.id}>
              <span className="settings-name">
                <span className={`settings-dot ${dotClass}`} />
                {type.name}
              </span>
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
                {savedId === type.id && (
                  <span className="saved-indicator">
                    <CheckIcon size={11} />
                    Saved
                  </span>
                )}
                <button
                  className="reset-btn"
                  disabled={isDefault}
                  onClick={() => resetRow(type.id)}
                  title="Reset to default"
                >
                  <ResetIcon size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ApiKeySection />
    </div>
  );
}