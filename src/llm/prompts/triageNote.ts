import type {
  DimensionResult,
  JobPosting,
  RequirementMatch,
} from "../../core/types.js";
import type { BuiltPrompt } from "./extractJob.js";

const SYSTEM = `You write a short triage note a hiring manager can scan in
five seconds, given only the structured match result.

Output: PLAIN TEXT, 2 to 4 sentences. No markdown, no bullets, no headings,
no JSON.

Constraints:
- Lead with the strongest dimension AND its score (e.g. "technical_skills
  scored 0.82").
- Name 1-2 specific gaps that matter; prefer must-haves over nice-to-haves.
  Reference concrete skills or topics from the requirement texts.
- If many requirements are uncertain, mention the count.
- Stay descriptive. Do NOT use hype words like "strong fit", "great
  candidate", "perfect", "rockstar".
- Do NOT restate the overall number; the reader can already see it.
- Be concrete, not generic.`;

export function buildTriageNotePrompt(args: {
  jobPosting: JobPosting;
  dimensions: DimensionResult[];
  matches: RequirementMatch[];
  overallScore: number;
  flaggedForReview: boolean;
}): BuiltPrompt {
  const reqById = new Map(args.jobPosting.requirements.map((r) => [r.id, r]));

  const requirements = args.matches.map((m) => {
    const req = reqById.get(m.requirementId);
    return {
      requirement: req?.text ?? m.requirementId,
      hardness: req?.hardness ?? null,
      dimension: req?.dimension ?? null,
      verdict: m.verdict,
      matcher: m.matcher,
    };
  });

  const payload = {
    overallScore: args.overallScore,
    flaggedForReview: args.flaggedForReview,
    dimensions: args.dimensions,
    requirements,
  };

  const userText = `Match result:\n${JSON.stringify(payload, null, 2)}\n\nWrite the triage note.`;

  return {
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  };
}
