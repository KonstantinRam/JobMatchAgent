import type {
  ClaimSet,
  JobRequirement,
} from "../../core/types.js";
import type { BuiltPrompt } from "./extractJob.js";

const SYSTEM = `You assess ONE soft job requirement against a candidate's
narrative bullets. You see only the requirement and the bullets — no other
requirements, no overall score, no full job description.

Return ONLY a single JSON object. No prose, no markdown fences:
{
  "verdict": "matched" | "unmatched" | "uncertain",
  "evidence": string[],   // source refs from the bullets, e.g. "experience[0].highlights[2]"
  "reasoning": string,    // 1-2 sentences, concrete
  "confidence": number    // 0.0 to 1.0
}

Verdict rules:
- "matched"   — at least one bullet provides concrete evidence the
                requirement is satisfied. Cite the source refs of those
                bullets in "evidence".
- "unmatched" — no bullet supports OR contradicts the requirement, and
                nothing in the candidate's domain implicitly suggests it.
- "uncertain" — bullets neither confirm nor refute. This is a legitimate
                answer. Do NOT guess; pick "uncertain" when evidence is
                thin.

Confidence calibration:
- 0.9+      direct, specific evidence in one or more bullets.
- 0.6-0.9   indirect or inferential evidence.
- <0.6      the verdict is shaky; reconsider whether "uncertain" is the
            honest answer.

Always cite source refs in "evidence" when you mark "matched". For
"uncertain" or "unmatched", "evidence" may be an empty array.

Output JSON only.`;

export function buildSoftMatchPrompt(
  requirement: JobRequirement,
  claimSet: ClaimSet,
): BuiltPrompt {
  const bullets = claimSet.narrativeBullets
    .map((b) => `[${b.source}] ${b.text}`)
    .join("\n");

  const userText = [
    `Requirement: ${requirement.text}`,
    `Dimension: ${requirement.dimension}`,
    `Hardness: ${requirement.hardness}`,
    "",
    "--- NARRATIVE BULLETS ---",
    bullets || "(none)",
    "",
    "Output JSON only.",
  ].join("\n");

  return {
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  };
}
