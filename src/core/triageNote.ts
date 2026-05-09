import { buildTriageNotePrompt } from "../llm/prompts/triageNote.js";
import type {
  DimensionKey,
  DimensionResult,
  JobPosting,
  LLMProvider,
  RequirementMatch,
} from "./types.js";

export async function generateTriageNote(
  llm: LLMProvider,
  args: {
    jobPosting: JobPosting;
    dimensions: DimensionResult[];
    matches: RequirementMatch[];
    overallScore: number;
    flaggedForReview: boolean;
  },
): Promise<string> {
  try {
    const { system, messages } = buildTriageNotePrompt(args);
    const response = await llm.complete({ system, messages, temperature: 0.3 });
    return response.trim();
  } catch (e) {
    console.error("triage note failed:", e);
    return generateFallbackTriageNote(args);
  }
}

export function generateFallbackTriageNote(args: {
  jobPosting: JobPosting;
  dimensions: DimensionResult[];
  matches: RequirementMatch[];
  overallScore: number;
  flaggedForReview: boolean;
}): string {
  const scored = args.dimensions.filter((d) => d.score !== null);

  let leading: string;
  if (scored.length === 0) {
    leading = "No scorable dimensions.";
  } else {
    let strongest = scored[0];
    for (const d of scored) {
      if ((d.score as number) > (strongest.score as number)) strongest = d;
    }
    leading = `${humanizeDimension(strongest.dimension)}: ${strongest.score}/100.`;
  }

  let unmetMustHaves = 0;
  let uncertain = 0;
  for (const d of args.dimensions) {
    unmetMustHaves += d.totalMustHaves - d.matchedMustHaves;
    uncertain += d.uncertainCount + d.unmatchableCount;
  }

  const flag = args.flaggedForReview ? " Flagged for review." : "";
  const out = `${leading} ${unmetMustHaves} must-haves unmet. ${uncertain} requirements uncertain.${flag}`;
  return out.replace(/ {2,}/g, " ").trimEnd();
}

function humanizeDimension(key: DimensionKey): string {
  const replaced = key.replace(/_/g, " ");
  return replaced.charAt(0).toUpperCase() + replaced.slice(1);
}
