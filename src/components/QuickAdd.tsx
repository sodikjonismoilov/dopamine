import { useRef, useState } from "react";
import type { ActivityType, ParsedEntry } from "../lib/types";
import { commitEntry, parseEntry } from "../lib/logPipeline";
import { isHitDominant } from "../lib/scoring";
import { BoltIcon, LeafIcon, PlusIcon } from "./icons";

interface Props {
  activityTypes: ActivityType[];
  onLogged: () => void; // parent refetches today's totals / recent list
}

export function QuickAdd({ activityTypes, onLogged }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<{ rawText: string; parsed: ParsedEntry } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);

    try {
      const result = await parseEntry(text, activityTypes);

      if (!result.needsConfirmation) {
        const activityType = activityTypes.find((t) => t.id === result.parsed.activityTypeId)!;
        await commitEntry(text, result.parsed, activityType);
        setText("");
        onLogged();
      } else {
        // Low-confidence / LLM-fallback result — show the confirm step
        // rather than saving silently.
        setPending({ rawText: text, parsed: result.parsed });
      }
    } catch {
      setError("Couldn't figure that one out — try rephrasing, or add it manually below.");
    }
  }

  async function confirmPending() {
    if (!pending) return;
    const activityType = activityTypes.find((t) => t.id === pending.parsed.activityTypeId)!;
    await commitEntry(pending.rawText, pending.parsed, activityType);
    setPending(null);
    setText("");
    onLogged();
    inputRef.current?.focus();
  }

  if (pending) {
    const activityType = activityTypes.find((t) => t.id === pending.parsed.activityTypeId);
    const isHit = activityType ? isHitDominant(activityType) : true;
    const Icon = isHit ? BoltIcon : LeafIcon;

    return (
      <div className="confirm-box">
        <div className="confirm-heading">
          <span className={`confirm-icon ${isHit ? "hit-icon" : "depth-icon"}`}>
            <Icon size={13} />
          </span>
          <span className="confirm-activity">{activityType?.name ?? "Unknown"}</span>
          <span className="recent-entry-sep">&middot;</span>
          <span className="confirm-duration">{pending.parsed.durationMinutes} min</span>
        </div>
        <p className="confirm-text">Wasn&rsquo;t sure about that one — look right?</p>
        <div className="confirm-actions">
          <button className="confirm-save" onClick={confirmPending}>
            Save
          </button>
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="quick-add-field">
        <span className="quick-add-field-icon">
          <PlusIcon size={13} />
        </span>
        <input
          ref={inputRef}
          autoFocus
          type="text"
          placeholder="Log something..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
