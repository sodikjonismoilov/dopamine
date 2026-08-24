import { invoke } from "@tauri-apps/api/core";
import type { ActivityType, ParsedEntry } from "./types";


interface LlmParseResponse { 
  activityName: string | null;
  durationMinutes: number | null;

}

/**
 * called only when parseLocally() fails . the actual http call and api key 
 * both live in Rust (see parse_with_lmm_fallback() in lib.rs) so that the key isn't exposed to the frontend.
 *
 */

export async function parseWithLlmFallback(
  rawText: string, 
  activityTypes: ActivityType[]
): Promise<ParsedEntry | null> {
  const categoryNames = activityTypes.map((t) => t.name);

  const result = await invoke<LlmParseResponse>("parse_with_llm_fallback", {
    rawText,
    categoryNames,
  });

  if (!result.activityName || !result.durationMinutes) {
    return null;
  }
  const matchedType = activityTypes.find((t) => t.name === result.activityName);
  if (!matchedType) return null;

  return {
    activityTypeId: matchedType.id,
    durationMinutes: result.durationMinutes,
    confidence: "low",
    usedLlmFallback: true,
  };
}