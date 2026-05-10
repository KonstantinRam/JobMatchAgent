import type {
  DimensionResult,
  JobPosting,
  RequirementMatch,
} from "../../core/types.js";
import type { BuiltPrompt } from "./extractJob.js";

const SYSTEM = `You write a short note for a job seeker who has just
matched their profile against a job posting. The reader is the candidate.
Address them in second person ("your", "you").

Output: plain text, 3 to 5 sentences. No markdown, no bullets, no JSON.

Do:
- Lead with the strongest fit signal: name the specific skills or
  experience that matched, not just the dimension.
- Name must-have gaps by their actual skill or topic. "Postgres and
  Kubernetes aren't on your profile" beats "some technical gaps remain."
- Suggest practical framing: which transferable strengths to lean on,
  whether the gap is bridgeable, what's worth learning first to close it.
- Be honest. If the score is low and the gap is technical, say so
  plainly. Vague optimism is worse than a clear "this would be a stretch."
- If flaggedForReview is true, treat it as a signal to lean toward the
  hard truth, not soften it.

Don't:
- Use hype words: "strong fit", "perfect", "great candidate", "rockstar".
- Restate the overall number: they can see it on the screen.
- Hide gaps behind soft language. "Some areas to develop" is worse than
  naming the actual missing skills.
- Be sycophantic. The reader doesn't need encouragement; they need an
  honest read.
- Include caveats or disclaimers ("this is a generated assessment", etc.).`;

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
      evidence: m.evidence,
      reasoning: m.reasoning ?? null,
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
