import { z } from "zod";
import { buildSoftMatchPrompt } from "../llm/prompts/softMatch.js";
import type {
  ClaimSet,
  JobRequirement,
  LLMProvider,
  RequirementMatch,
  SkillClaim,
} from "./types.js";

const SoftMatchResponseSchema = z.object({
  verdict: z.enum(["matched", "unmatched", "uncertain"]),
  evidence: z.array(z.string()),
  reasoning: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

/**
 * Matches every requirement in a job posting against a candidate's claim set.
 *
 * Routing per requirement:
 *   matchability === "tokenizable" → tokenizerMatch (pure code, no LLM)
 *   matchability === "soft"        → softMatch     (one LLM call per requirement)
 *   matchability === "unmatchable" → skipped       (verdict "uncertain", matcher "skipped")
 *
 * Soft matches run in parallel via Promise.all. One failed soft match should
 * not poison the others — a failed call yields verdict "uncertain" with a
 * reasoning that names the failure mode.
 *
 * Returns matches in the same order as requirements.
 */
export async function matchRequirements(
  llm: LLMProvider,
  requirements: JobRequirement[],
  claimSet: ClaimSet,
): Promise<RequirementMatch[]> {
  const pending: Promise<RequirementMatch>[] = requirements.map((req) => {
    if (req.matchability === "tokenizable") {
      return Promise.resolve(tokenizerMatch(req, claimSet));
    }
    if (req.matchability === "soft") {
      return softMatch(llm, req, claimSet).catch((e) => ({
        requirementId: req.id,
        verdict: "uncertain" as const,
        matcher: "soft_llm" as const,
        evidence: [],
        reasoning: `soft matcher failed: ${(e as Error).message}`,
        llmConfidence: 0,
      }));
    }
    return Promise.resolve<RequirementMatch>({
      requirementId: req.id,
      verdict: "uncertain",
      matcher: "skipped",
      evidence: [],
      reasoning: "marked unmatchable at extraction",
    });
  });

  return Promise.all(pending);
}

/**
 * Deterministic tokenizer match.
 *
 */
export function tokenizerMatch(
  req: JobRequirement,
  claimSet: ClaimSet,
): RequirementMatch {
  if (req.matchability !== "tokenizable") {
    throw new Error(
      `tokenizerMatch: requirement ${req.id} has matchability="${req.matchability}", expected "tokenizable"`,
    );
  }
  if (!req.skillTokens || req.skillTokens.length === 0) {
    throw new Error(
      `tokenizerMatch: requirement ${req.id} is missing skillTokens`,
    );
  }

  const matchedClaims: SkillClaim[] = [];
  for (const token of req.skillTokens) {
    const claim = claimSet.skills.find((s) => s.skillToken === token);
    if (!claim) {
      return {
        requirementId: req.id,
        verdict: "unmatched",
        matcher: "tokenizer",
        evidence: [],
      };
    }
    matchedClaims.push(claim);
  }

  const evidence = unique(matchedClaims.flatMap((c) => c.evidenceRefs));

  if (req.yearsRequired == null) {
    return {
      requirementId: req.id,
      verdict: "matched",
      matcher: "tokenizer",
      evidence,
    };
  }

  const yearsRequired = req.yearsRequired;
  const allMeet = matchedClaims.every((c) => c.years >= yearsRequired);
  return {
    requirementId: req.id,
    verdict: allMeet ? "matched" : "unmatched",
    matcher: "tokenizer",
    evidence,
  };
}

/**
 * Narrow LLM match for soft requirements.
 *
 * The LLM only sees ONE requirement and the narrative bullets. It does not
 * see other requirements, the score, or the JD. Confined surface.
 *
 * Validates the response with SoftMatchResponseSchema. On parse failure,
 * throws — the orchestrator catches and emits "uncertain". No retries.
 */
export async function softMatch(
  llm: LLMProvider,
  req: JobRequirement,
  claimSet: ClaimSet,
): Promise<RequirementMatch> {
  const { system, messages } = buildSoftMatchPrompt(req, claimSet);
  const raw = await llm.completeJSON<unknown>({
    system,
    messages,
    temperature: 0.2,
  });

  const result = SoftMatchResponseSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`softMatch: invalid response from LLM: ${issues}`);
  }

  return {
    requirementId: req.id,
    verdict: result.data.verdict,
    matcher: "soft_llm",
    evidence: result.data.evidence,
    reasoning: result.data.reasoning,
    llmConfidence: result.data.confidence,
  };
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}
