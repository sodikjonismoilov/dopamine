import type { ActivityType, ParsedEntry } from "./types";

// TODO: replace with a read from macOS Keychain (e.g. via a small Rust
// command exposed through `invoke`) before shipping. A bare env var /
// local config file is a placeholder for local development only — never
// commit a real key, and never store it in localStorage.
function getApiKey(): string {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "No Anthropic API key configured. Set VITE_ANTHROPIC_API_KEY for local dev, " +
        "or wire up Keychain storage before shipping."
    );
  }
  return key;
}

interface LlmParseResponse {
  activityName: string | null;
  durationMinutes: number | null;
}

/** Called only when parseLocally() fails. Sends the raw text plus the known
 * category names (never lets the model invent a new category — that would
 * break the fixed-categories decision from the schema design) and asks for
 * structured JSON back. */
export async function parseWithLlmFallback(
  rawText: string,
  activityTypes: ActivityType[]
): Promise<ParsedEntry | null> {
  const categoryNames = activityTypes.map((t) => t.name);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": getApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001", // fast + cheap; this is a fallback path, not the main experience
      max_tokens: 200,
      system:
        `Extract an activity log from free text. Respond with ONLY raw JSON, no markdown fences, ` +
        `matching this shape: {"activityName": string | null, "durationMinutes": number | null}. ` +
        `activityName MUST be exactly one of: ${categoryNames.join(", ")}. ` +
        `If nothing matches, use null. If no duration is stated or inferable, use null.`,
      messages: [{ role: "user", content: rawText }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM fallback request failed: ${response.status}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock) return null;

  let parsed: LlmParseResponse;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    return null; // model didn't return clean JSON — treat as a full parse failure
  }

  if (!parsed.activityName || parsed.durationMinutes == null) return null;

  const matchedType = activityTypes.find((t) => t.name === parsed.activityName);
  if (!matchedType) return null; // model hallucinated a category outside the fixed list

  return {
    activityTypeId: matchedType.id,
    durationMinutes: parsed.durationMinutes,
    confidence: "low", // fallback results always require the confirm step
    usedLlmFallback: true,
  };
}
