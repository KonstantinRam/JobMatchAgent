import { test } from "node:test";
import assert from "node:assert/strict";
import { assessMatch } from "../assessMatch.js";
import { FakeLLMProvider } from "./_fakeLlm.js";
import type {
  BackgroundProfile,
  JobPosting,
  LLMCallOptions,
} from "../types.js";

test("assessMatch: end-to-end with tokenizable + soft + unmatchable requirements", async () => {
  const profile: BackgroundProfile = {
    name: "Alex",
    headline: "Senior Engineer",
    summary: "Engineer with broad ownership.",
    experience: [
      {
        role: "Engineer",
        company: "Acme",
        startDate: "2020-01",
        endDate: "2024-01",
        highlights: ["Owned migration end-to-end."],
      },
    ],
    projects: [],
    skills: [{ category: "languages", skills: ["TypeScript"] }],
    education: [],
  };

  const jobPosting: JobPosting = {
    title: "Engineer",
    company: "Acme",
    location: null,
    responsibilities: [],
    requirements: [
      {
        id: "r1",
        text: "TypeScript",
        dimension: "technical_skills",
        hardness: "must_have",
        matchability: "tokenizable",
        skillTokens: ["typescript"],
        yearsRequired: 3,
      },
      {
        id: "r2",
        text: "Comfortable with ambiguity",
        dimension: "role_fit",
        hardness: "must_have",
        matchability: "soft",
      },
      {
        id: "r3",
        text: "Travel 50%",
        dimension: "role_fit",
        hardness: "nice_to_have",
        matchability: "unmatchable",
      },
    ],
    toneAndCulture: null,
    rawText: "raw posting",
  };

  const softMatchResponse = {
    verdict: "matched",
    evidence: ["experience[0].highlights[0]"],
    reasoning: "Bullet attests to ownership.",
    confidence: 0.85,
  };

  const llm = new FakeLLMProvider((opts: LLMCallOptions) => {
    if (opts.system?.startsWith("You write a short triage note")) {
      return "Triage note from LLM.";
    }
    return softMatchResponse;
  });

  const result = await assessMatch(llm, jobPosting, profile);

  // jobPosting passes through.
  assert.equal(result.jobPosting, jobPosting);

  // claimSet derived from profile.
  const tsClaim = result.claimSet.skills.find(
    (s) => s.skillToken === "typescript",
  );
  assert.ok(tsClaim, "claimSet should include a typescript skill claim");
  assert.ok(
    result.claimSet.narrativeBullets.some(
      (b) => b.source === "experience[0].highlights[0]",
    ),
    "claimSet should expose the experience highlight as a narrative bullet",
  );

  // matches in order, routed through the right matcher.
  assert.equal(result.matches.length, 3);
  assert.equal(result.matches[0].requirementId, "r1");
  assert.equal(result.matches[0].matcher, "tokenizer");
  assert.equal(result.matches[0].verdict, "matched");
  assert.equal(result.matches[1].requirementId, "r2");
  assert.equal(result.matches[1].matcher, "soft_llm");
  assert.equal(result.matches[1].verdict, "matched");
  assert.equal(result.matches[2].requirementId, "r3");
  assert.equal(result.matches[2].matcher, "skipped");
  assert.equal(result.matches[2].verdict, "uncertain");

  // dimensions roll-up.
  assert.equal(result.dimensions.length, 4);
  const tech = result.dimensions.find((d) => d.dimension === "technical_skills");
  assert.ok(tech);
  assert.equal(tech.totalMustHaves, 1);
  assert.equal(tech.matchedMustHaves, 1);
  assert.equal(tech.score, 100);
  const roleFit = result.dimensions.find((d) => d.dimension === "role_fit");
  assert.ok(roleFit);
  assert.equal(roleFit.totalMustHaves, 1);
  assert.equal(roleFit.matchedMustHaves, 1);
  assert.equal(roleFit.unmatchableCount, 1);
  assert.equal(roleFit.score, 100);

  // overallScore: only technical_skills (0.4) + role_fit (0.25) scored,
  // both 100 → 100.
  assert.equal(result.overallScore, 100);

  // flaggedForReview: no unmet must-haves, no uncertain, the unmatchable
  // requirement is a nice-to-have, score is 100 → not flagged.
  assert.equal(result.flaggedForReview, false);

  // unscoredRequirements: only r3 (unmatchable).
  assert.equal(result.unscoredRequirements.length, 1);
  assert.equal(result.unscoredRequirements[0].id, "r3");

  // triageNote: from the LLM (trimmed by generateTriageNote).
  assert.equal(result.triageNote, "Triage note from LLM.");
});
