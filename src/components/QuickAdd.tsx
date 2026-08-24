import { useRef, useState } from "react";
import type { ActivityType, ParsedEntry } from "../lib/types";
import { commitEntry, parseEntry } from "../lib/logPipeline";

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
    return (
      <div className="confirm-box">
        <p className="confirm-text">
          {activityType?.name ?? "Unknown"} · {pending.parsed.durationMinutes} min — look right?
        </p>
        <div className="confirm-actions">
          <button onClick={confirmPending}>Save</button>
          <button onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        autoFocus
        type="text"
        placeholder="Log something..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
