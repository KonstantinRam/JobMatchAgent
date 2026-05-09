import type {
  DimensionKey,
  DimensionResult,
  JobPosting,
  JobRequirement,
  RequirementMatch,
} from "./types.js";

/**
 * Pure score derivation.
 *
 * The matcher produces RequirementMatches. This module rolls them up into
 * DimensionResults and an overall score. No LLM. No I/O. Fully deterministic.
 */

/** The four DimensionKey values, declared once for use in iteration. */
export const ALL_DIMENSIONS: DimensionKey[] = [
  "technical_skills",
  "domain_knowledge",
  "experience_level",
  "role_fit",
];

/**
 * Per-dimension weights for combining into the overall score. Sum to 1.0.
 *
 * Rationale: technical_skills weighted highest because for engineering roles
 * the bar is capability-first; role_fit second because culture/role shape is
 * a known make-or-break; experience_level and domain knowledge are softer
 * signals.
 *
 * Tweak in one place. If you change these, mention it in the writeup.
 */
export const DIMENSION_WEIGHTS: Record<DimensionKey, number> = {
  technical_skills: 0.4,
  role_fit: 0.25,
  experience_level: 0.2,
  domain_knowledge: 0.15,
};

/**
 * Within a dimension, must-haves dominate the score. Nice-to-haves contribute
 * a smaller boost.
 *
 * Formula:
 *   if no scorable requirements in the dimension → score = null
 *   if no must-haves and only nice-to-haves → score = 100 * matched_nice / total_nice
 *   otherwise:
 *     score = 100 * (
 *       MUST_HAVE_WEIGHT * (matched_must / total_must)
 *       + NICE_WEIGHT    * (matched_nice / max(1, total_nice))   // 0 if no nice
 *     ) / (MUST_HAVE_WEIGHT + (total_nice > 0 ? NICE_WEIGHT : 0))
 *
 * The denominator handles "no nice-to-haves" without inflating must-have
 * coverage. This matters because dropping the nice-to-have weight when
 * there are none means must-have coverage = full score (correct), not
 * must-have coverage * 0.7 (wrong).
 */
export const MUST_HAVE_WEIGHT = 0.7;
export const NICE_WEIGHT = 0.3;

/** Confidence/score thresholds for the review flag. */
export const LOW_OVERALL_SCORE_THRESHOLD = 50;
export const HIGH_UNCERTAIN_RATIO_THRESHOLD = 0.25;

/**
 * Computes per-dimension results from the matches and the JobPosting.
 *
 * Throws if matches.length !== requirements.length, or if any
 * match.requirementId doesn't appear in requirements (defense in depth —
 * the orchestrator should never produce a mismatched set).
 *
 * "Scorable" = matchability "tokenizable" or "soft", AND verdict is
 * "matched" or "unmatched". Soft "uncertain" verdicts and "unmatchable"
 * requirements are counted in uncertainCount / unmatchableCount but do NOT
 * contribute to the dimension score.
 */
export function rollUpDimensions(
  jobPosting: JobPosting,
  matches: RequirementMatch[],
): DimensionResult[] {
  const reqById = new Map<string, JobRequirement>();
  for (const req of jobPosting.requirements) {
    reqById.set(req.id, req);
  }

  if (matches.length !== jobPosting.requirements.length) {
    throw new Error(
      `rollUpDimensions: matches.length (${matches.length}) !== requirements.length (${jobPosting.requirements.length})`,
    );
  }

  for (const m of matches) {
    if (!reqById.has(m.requirementId)) {
      throw new Error(
        `rollUpDimensions: match references unknown requirementId "${m.requirementId}"`,
      );
    }
  }

  const results: Record<DimensionKey, DimensionResult> = {
    technical_skills: emptyDimensionResult("technical_skills"),
    domain_knowledge: emptyDimensionResult("domain_knowledge"),
    experience_level: emptyDimensionResult("experience_level"),
    role_fit: emptyDimensionResult("role_fit"),
  };

  for (const m of matches) {
    const req = reqById.get(m.requirementId)!;
    const dim = results[req.dimension];

    if (m.matcher === "skipped") {
      dim.unmatchableCount += 1;
      continue;
    }

    if (m.matcher === "soft_llm" && m.verdict === "uncertain") {
      dim.uncertainCount += 1;
      continue;
    }

    if (
      (req.matchability === "tokenizable" || req.matchability === "soft") &&
      (m.verdict === "matched" || m.verdict === "unmatched")
    ) {
      if (req.hardness === "must_have") {
        dim.totalMustHaves += 1;
        if (m.verdict === "matched") dim.matchedMustHaves += 1;
      } else {
        dim.totalNiceToHaves += 1;
        if (m.verdict === "matched") dim.matchedNiceToHaves += 1;
      }
    }
  }

  for (const key of ALL_DIMENSIONS) {
    results[key].score = computeDimensionScore(results[key]);
  }

  return ALL_DIMENSIONS.map((key) => results[key]);
}

function emptyDimensionResult(dimension: DimensionKey): DimensionResult {
  return {
    dimension,
    totalMustHaves: 0,
    matchedMustHaves: 0,
    totalNiceToHaves: 0,
    matchedNiceToHaves: 0,
    uncertainCount: 0,
    unmatchableCount: 0,
    score: null,
  };
}

function computeDimensionScore(d: DimensionResult): number | null {
  const tm = d.totalMustHaves;
  const mm = d.matchedMustHaves;
  const tn = d.totalNiceToHaves;
  const mn = d.matchedNiceToHaves;

  if (tm === 0 && tn === 0) return null;
  if (tm === 0) return Math.round((100 * mn) / tn);
  if (tn === 0) return Math.round((100 * mm) / tm);

  const numerator = MUST_HAVE_WEIGHT * (mm / tm) + NICE_WEIGHT * (mn / tn);
  return Math.round(100 * numerator);
}

/**
 * Derives the overall score from dimension results.
 *
 * - Dimensions with score === null are excluded from the weighted average,
 *   and their weight is redistributed proportionally across the remaining
 *   dimensions.
 * - If ALL dimensions have score === null, return 0 (and flagged-for-review
 *   should pick this up because every requirement was unscorable).
 * - Round to nearest integer.
 */
export function deriveOverallScore(dimensions: DimensionResult[]): number {
  const scored = dimensions.filter((d) => d.score !== null);
  if (scored.length === 0) return 0;

  let weightSum = 0;
  let weightedSum = 0;
  for (const d of scored) {
    const w = DIMENSION_WEIGHTS[d.dimension];
    weightSum += w;
    weightedSum += w * (d.score as number);
  }

  if (weightSum === 0) return 0;

  const overall = Math.round(weightedSum / weightSum);
  return Math.max(0, Math.min(100, overall));
}

/**
 * Decides whether the assessment needs human review.
 *
 * Flagged if ANY of:
 *   a. overallScore < LOW_OVERALL_SCORE_THRESHOLD
 *   b. any dimension result has matchedMustHaves < totalMustHaves
 *      (i.e. an unmet must-have anywhere)
 *   c. uncertain ratio:
 *      total uncertain (across all dimensions) / total scorable+uncertain
 *      requirements >= HIGH_UNCERTAIN_RATIO_THRESHOLD
 *   d. any unmatchable requirement is a must-have
 *
 * Pure function. Adjust rules here, not in callers.
 */
export function computeFlaggedForReview(args: {
  overallScore: number;
  dimensions: DimensionResult[];
  requirements: JobRequirement[];
  matches: RequirementMatch[];
}): boolean {
  if (args.overallScore < LOW_OVERALL_SCORE_THRESHOLD) return true;

  for (const d of args.dimensions) {
    if (d.matchedMustHaves < d.totalMustHaves) return true;
  }

  let totalUncertain = 0;
  let totalScorable = 0;
  for (const d of args.dimensions) {
    totalUncertain += d.uncertainCount;
    totalScorable += d.totalMustHaves + d.totalNiceToHaves;
  }
  const denom = totalUncertain + totalScorable;
  if (denom > 0 && totalUncertain / denom >= HIGH_UNCERTAIN_RATIO_THRESHOLD) {
    return true;
  }

  const reqById = new Map<string, JobRequirement>();
  for (const req of args.requirements) {
    reqById.set(req.id, req);
  }
  for (const m of args.matches) {
    if (m.matcher === "skipped") {
      const req = reqById.get(m.requirementId);
      if (req && req.hardness === "must_have") return true;
    }
  }

  return false;
}

/**
 * Collects requirements that did not contribute to scoring:
 *   - matchability === "unmatchable" (always)
 *   - matchability === "soft" AND verdict === "uncertain"
 *
 * Order: same as requirements[].
 */
export function collectUnscoredRequirements(
  requirements: JobRequirement[],
  matches: RequirementMatch[],
): JobRequirement[] {
  const matchByReqId = new Map<string, RequirementMatch>();
  for (const m of matches) {
    matchByReqId.set(m.requirementId, m);
  }

  const out: JobRequirement[] = [];
  for (const req of requirements) {
    if (req.matchability === "unmatchable") {
      out.push(req);
      continue;
    }
    const m = matchByReqId.get(req.id);
    if (m && m.verdict === "uncertain") {
      out.push(req);
    }
  }
  return out;
}
