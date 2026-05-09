import { matchRequirements } from "./matchRequirements.js";
import { normalizeProfile } from "./normalizeProfile.js";
import {
  collectUnscoredRequirements,
  computeFlaggedForReview,
  deriveOverallScore,
  rollUpDimensions,
} from "./scoreMatch.js";
import { generateTriageNote } from "./triageNote.js";
import type {
  BackgroundProfile,
  JobPosting,
  LLMProvider,
  MatchAssessment,
} from "./types.js";

export async function assessMatch(
  llm: LLMProvider,
  jobPosting: JobPosting,
  profile: BackgroundProfile,
): Promise<MatchAssessment> {
  const claimSet = normalizeProfile(profile);
  const matches = await matchRequirements(
    llm,
    jobPosting.requirements,
    claimSet,
  );
  const dimensions = rollUpDimensions(jobPosting, matches);
  const overallScore = deriveOverallScore(dimensions);
  const flaggedForReview = computeFlaggedForReview({
    overallScore,
    dimensions,
    requirements: jobPosting.requirements,
    matches,
  });
  const unscoredRequirements = collectUnscoredRequirements(
    jobPosting.requirements,
    matches,
  );
  const triageNote = await generateTriageNote(llm, {
    jobPosting,
    dimensions,
    matches,
    overallScore,
    flaggedForReview,
  });
  return {
    jobPosting,
    claimSet,
    matches,
    dimensions,
    overallScore,
    flaggedForReview,
    unscoredRequirements,
    triageNote,
  };
}
