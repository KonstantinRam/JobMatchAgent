import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateFallbackTriageNote,
  generateTriageNote,
} from "../triageNote.js";
import { FakeLLMProvider, ThrowingLLMProvider } from "./_fakeLlm.js";
import type { DimensionResult, JobPosting } from "../types.js";

const jobPosting: JobPosting = {
  title: "Engineer",
  company: null,
  location: null,
  responsibilities: [],
  requirements: [],
  toneAndCulture: null,
  rawText: "",
};

const dimensions: DimensionResult[] = [
  {
    dimension: "technical_skills",
    totalMustHaves: 2,
    matchedMustHaves: 1,
    totalNiceToHaves: 0,
    matchedNiceToHaves: 0,
    uncertainCount: 1,
    unmatchableCount: 0,
    score: 85,
  },
  {
    dimension: "domain_knowledge",
    totalMustHaves: 0,
    matchedMustHaves: 0,
    totalNiceToHaves: 0,
    matchedNiceToHaves: 0,
    uncertainCount: 0,
    unmatchableCount: 1,
    score: null,
  },
  {
    dimension: "experience_level",
    totalMustHaves: 0,
    matchedMustHaves: 0,
    totalNiceToHaves: 0,
    matchedNiceToHaves: 0,
    uncertainCount: 0,
    unmatchableCount: 0,
    score: 70,
  },
  {
    dimension: "role_fit",
    totalMustHaves: 0,
    matchedMustHaves: 0,
    totalNiceToHaves: 0,
    matchedNiceToHaves: 0,
    uncertainCount: 0,
    unmatchableCount: 0,
    score: 50,
  },
];

const EXPECTED_FALLBACK_FLAGGED =
  "Technical skills: 85/100. 1 must-haves unmet. 2 requirements uncertain. Flagged for review.";

test("generateFallbackTriageNote: deterministic output with strongest dimension and flag", () => {
  const result = generateFallbackTriageNote({
    jobPosting,
    dimensions,
    matches: [],
    overallScore: 75,
    flaggedForReview: true,
  });
  assert.equal(result, EXPECTED_FALLBACK_FLAGGED);
});

test("generateFallbackTriageNote: omits the flag suffix when not flagged", () => {
  const result = generateFallbackTriageNote({
    jobPosting,
    dimensions,
    matches: [],
    overallScore: 75,
    flaggedForReview: false,
  });
  assert.equal(
    result,
    "Technical skills: 85/100. 1 must-haves unmet. 2 requirements uncertain.",
  );
});

test("generateFallbackTriageNote: all dimension scores null → 'No scorable dimensions.'", () => {
  const allNull: DimensionResult[] = dimensions.map((d) => ({
    ...d,
    score: null,
  }));
  const result = generateFallbackTriageNote({
    jobPosting,
    dimensions: allNull,
    matches: [],
    overallScore: 0,
    flaggedForReview: false,
  });
  assert.equal(
    result,
    "No scorable dimensions. 1 must-haves unmet. 2 requirements uncertain.",
  );
});

test("generateTriageNote: returns trimmed LLM response on success", async () => {
  const llm = new FakeLLMProvider("  All good.  \n");
  const result = await generateTriageNote(llm, {
    jobPosting,
    dimensions,
    matches: [],
    overallScore: 75,
    flaggedForReview: false,
  });
  assert.equal(result, "All good.");
});

test("generateTriageNote: LLM throws → falls back to deterministic note", async () => {
  const llm = new ThrowingLLMProvider("network down");
  const result = await generateTriageNote(llm, {
    jobPosting,
    dimensions,
    matches: [],
    overallScore: 75,
    flaggedForReview: true,
  });
  assert.equal(result, EXPECTED_FALLBACK_FLAGGED);
});
