import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_DIMENSIONS,
  DIMENSION_WEIGHTS,
  collectUnscoredRequirements,
  computeFlaggedForReview,
  deriveOverallScore,
  rollUpDimensions,
} from "../scoreMatch.js";
import type {
  DimensionKey,
  DimensionResult,
  JobPosting,
  JobRequirement,
  RequirementMatch,
} from "../types.js";

// ---------- helpers --------------------------------------------------------

function req(
  id: string,
  overrides: Partial<JobRequirement> = {},
): JobRequirement {
  return {
    id,
    text: `requirement ${id}`,
    dimension: "technical_skills",
    hardness: "must_have",
    matchability: "tokenizable",
    ...overrides,
  };
}

function posting(requirements: JobRequirement[]): JobPosting {
  return {
    title: "Test Role",
    company: null,
    location: null,
    responsibilities: [],
    requirements,
    toneAndCulture: null,
    rawText: "",
  };
}

function match(
  requirementId: string,
  overrides: Partial<RequirementMatch> = {},
): RequirementMatch {
  return {
    requirementId,
    verdict: "matched",
    matcher: "tokenizer",
    evidence: [],
    ...overrides,
  };
}

function findDim(results: DimensionResult[], key: DimensionKey): DimensionResult {
  const d = results.find((r) => r.dimension === key);
  if (!d) throw new Error(`missing dimension ${key}`);
  return d;
}

function emptyDim(
  dimension: DimensionKey,
  overrides: Partial<DimensionResult> = {},
): DimensionResult {
  return {
    dimension,
    totalMustHaves: 0,
    matchedMustHaves: 0,
    totalNiceToHaves: 0,
    matchedNiceToHaves: 0,
    uncertainCount: 0,
    unmatchableCount: 0,
    score: null,
    ...overrides,
  };
}

// ---------- rollUpDimensions ---------------------------------------------

test("rollUpDimensions: throws when matches.length !== requirements.length", () => {
  const jp = posting([req("a"), req("b")]);
  const matches = [match("a")];
  assert.throws(() => rollUpDimensions(jp, matches), /length/);
});

test("rollUpDimensions: throws naming the unknown requirementId", () => {
  const jp = posting([req("a")]);
  const matches = [match("ghost")];
  assert.throws(() => rollUpDimensions(jp, matches), /ghost/);
});

test("rollUpDimensions: 2 must-haves both matched → score 100", () => {
  const jp = posting([
    req("a", { dimension: "technical_skills", hardness: "must_have" }),
    req("b", { dimension: "technical_skills", hardness: "must_have" }),
  ]);
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "matched" }),
  ];
  const results = rollUpDimensions(jp, matches);
  const d = findDim(results, "technical_skills");
  assert.equal(d.totalMustHaves, 2);
  assert.equal(d.matchedMustHaves, 2);
  assert.equal(d.score, 100);
});

test("rollUpDimensions: 1 must-have unmatched + 1 nice matched → score 30", () => {
  const jp = posting([
    req("a", { dimension: "technical_skills", hardness: "must_have" }),
    req("b", { dimension: "technical_skills", hardness: "nice_to_have" }),
  ]);
  const matches = [
    match("a", { verdict: "unmatched" }),
    match("b", { verdict: "matched" }),
  ];
  const results = rollUpDimensions(jp, matches);
  const d = findDim(results, "technical_skills");
  assert.equal(d.totalMustHaves, 1);
  assert.equal(d.matchedMustHaves, 0);
  assert.equal(d.totalNiceToHaves, 1);
  assert.equal(d.matchedNiceToHaves, 1);
  assert.equal(d.score, 30);
});

test("rollUpDimensions: only nice-to-haves (1 of 2 matched) → score 50", () => {
  const jp = posting([
    req("a", { dimension: "technical_skills", hardness: "nice_to_have" }),
    req("b", { dimension: "technical_skills", hardness: "nice_to_have" }),
  ]);
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "unmatched" }),
  ];
  const results = rollUpDimensions(jp, matches);
  const d = findDim(results, "technical_skills");
  assert.equal(d.totalMustHaves, 0);
  assert.equal(d.totalNiceToHaves, 2);
  assert.equal(d.matchedNiceToHaves, 1);
  assert.equal(d.score, 50);
});

test("rollUpDimensions: only must-haves (3 of 4 matched) → score 75", () => {
  const jp = posting([
    req("a", { hardness: "must_have" }),
    req("b", { hardness: "must_have" }),
    req("c", { hardness: "must_have" }),
    req("d", { hardness: "must_have" }),
  ]);
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "matched" }),
    match("c", { verdict: "matched" }),
    match("d", { verdict: "unmatched" }),
  ];
  const results = rollUpDimensions(jp, matches);
  const d = findDim(results, "technical_skills");
  assert.equal(d.totalMustHaves, 4);
  assert.equal(d.matchedMustHaves, 3);
  assert.equal(d.score, 75);
});

test("rollUpDimensions: soft uncertain match → uncertainCount 1, score ignores it", () => {
  const jp = posting([
    req("a", { hardness: "must_have", matchability: "tokenizable" }),
    req("b", { hardness: "must_have", matchability: "soft" }),
  ]);
  const matches = [
    match("a", { verdict: "matched", matcher: "tokenizer" }),
    match("b", { verdict: "uncertain", matcher: "soft_llm" }),
  ];
  const results = rollUpDimensions(jp, matches);
  const d = findDim(results, "technical_skills");
  assert.equal(d.totalMustHaves, 1);
  assert.equal(d.matchedMustHaves, 1);
  assert.equal(d.uncertainCount, 1);
  assert.equal(d.score, 100);
});

test("rollUpDimensions: skipped (unmatchable) match → unmatchableCount 1, totals unchanged", () => {
  const jp = posting([
    req("a", { hardness: "must_have", matchability: "tokenizable" }),
    req("b", { hardness: "must_have", matchability: "unmatchable" }),
  ]);
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "unmatched", matcher: "skipped" }),
  ];
  const results = rollUpDimensions(jp, matches);
  const d = findDim(results, "technical_skills");
  assert.equal(d.totalMustHaves, 1);
  assert.equal(d.matchedMustHaves, 1);
  assert.equal(d.unmatchableCount, 1);
  assert.equal(d.score, 100);
});

test("rollUpDimensions: dimension with zero requirements → score null", () => {
  const jp = posting([
    req("a", { dimension: "technical_skills", hardness: "must_have" }),
  ]);
  const matches = [match("a", { verdict: "matched" })];
  const results = rollUpDimensions(jp, matches);
  assert.equal(results.length, 4);
  for (const key of ALL_DIMENSIONS) {
    if (key !== "technical_skills") {
      const d = findDim(results, key);
      assert.equal(d.score, null);
      assert.equal(d.totalMustHaves, 0);
      assert.equal(d.totalNiceToHaves, 0);
    }
  }
});

test("rollUpDimensions: returns dimensions in ALL_DIMENSIONS order", () => {
  const jp = posting([]);
  const results = rollUpDimensions(jp, []);
  assert.deepEqual(
    results.map((r) => r.dimension),
    ALL_DIMENSIONS,
  );
});

// ---------- deriveOverallScore -------------------------------------------

test("deriveOverallScore: weighted across all four dimensions", () => {
  // technical_skills=80 (0.4), domain_knowledge=60 (0.15),
  // experience_level=50 (0.2), role_fit=70 (0.25)
  // → 32 + 9 + 10 + 17.5 = 68.5 → Math.round = 69
  const dims: DimensionResult[] = [
    emptyDim("technical_skills", { score: 80 }),
    emptyDim("domain_knowledge", { score: 60 }),
    emptyDim("experience_level", { score: 50 }),
    emptyDim("role_fit", { score: 70 }),
  ];
  assert.equal(deriveOverallScore(dims), 69);
});

test("deriveOverallScore: redistributes weight when one dimension is null", () => {
  // technical_skills=80 (0.4), domain_knowledge=null (0.15),
  // experience_level=60 (0.2), role_fit=70 (0.25)
  // weightSum = 0.85, weightedSum = 32 + 12 + 17.5 = 61.5
  // 61.5 / 0.85 = 72.3529... → round = 72
  const dims: DimensionResult[] = [
    emptyDim("technical_skills", { score: 80 }),
    emptyDim("domain_knowledge", { score: null }),
    emptyDim("experience_level", { score: 60 }),
    emptyDim("role_fit", { score: 70 }),
  ];
  const w = 0.4 + 0.2 + 0.25;
  const expected = Math.round((80 * 0.4 + 60 * 0.2 + 70 * 0.25) / w);
  assert.equal(deriveOverallScore(dims), expected);
});

test("deriveOverallScore: all null → 0", () => {
  const dims: DimensionResult[] = ALL_DIMENSIONS.map((k) =>
    emptyDim(k, { score: null }),
  );
  assert.equal(deriveOverallScore(dims), 0);
});

// ---------- computeFlaggedForReview --------------------------------------

test("computeFlaggedForReview: overallScore = 49 → flagged", () => {
  assert.equal(
    computeFlaggedForReview({
      overallScore: 49,
      dimensions: ALL_DIMENSIONS.map((k) => emptyDim(k)),
      requirements: [],
      matches: [],
    }),
    true,
  );
});

test("computeFlaggedForReview: clean state at score 80 → not flagged", () => {
  const dims: DimensionResult[] = [
    emptyDim("technical_skills", {
      totalMustHaves: 2,
      matchedMustHaves: 2,
      score: 100,
    }),
    emptyDim("domain_knowledge"),
    emptyDim("experience_level"),
    emptyDim("role_fit"),
  ];
  const reqs = [
    req("a", { hardness: "must_have" }),
    req("b", { hardness: "must_have" }),
  ];
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "matched" }),
  ];
  assert.equal(
    computeFlaggedForReview({
      overallScore: 80,
      dimensions: dims,
      requirements: reqs,
      matches,
    }),
    false,
  );
});

test("computeFlaggedForReview: unmet must-have anywhere → flagged", () => {
  const dims: DimensionResult[] = [
    emptyDim("technical_skills", {
      totalMustHaves: 2,
      matchedMustHaves: 1,
      score: 50,
    }),
    emptyDim("domain_knowledge"),
    emptyDim("experience_level"),
    emptyDim("role_fit"),
  ];
  assert.equal(
    computeFlaggedForReview({
      overallScore: 80,
      dimensions: dims,
      requirements: [],
      matches: [],
    }),
    true,
  );
});

test("computeFlaggedForReview: uncertainCount makes ratio >= 0.25 → flagged", () => {
  // 1 uncertain + 3 scorable = 1/4 = 0.25
  const dims: DimensionResult[] = [
    emptyDim("technical_skills", {
      totalMustHaves: 3,
      matchedMustHaves: 3,
      uncertainCount: 1,
      score: 100,
    }),
    emptyDim("domain_knowledge"),
    emptyDim("experience_level"),
    emptyDim("role_fit"),
  ];
  assert.equal(
    computeFlaggedForReview({
      overallScore: 80,
      dimensions: dims,
      requirements: [],
      matches: [],
    }),
    true,
  );
});

test("computeFlaggedForReview: an unmatchable must-have requirement → flagged", () => {
  const dims: DimensionResult[] = [
    emptyDim("technical_skills", {
      totalMustHaves: 1,
      matchedMustHaves: 1,
      unmatchableCount: 1,
      score: 100,
    }),
    emptyDim("domain_knowledge"),
    emptyDim("experience_level"),
    emptyDim("role_fit"),
  ];
  const reqs = [
    req("a", { hardness: "must_have" }),
    req("b", { hardness: "must_have", matchability: "unmatchable" }),
  ];
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "unmatched", matcher: "skipped" }),
  ];
  assert.equal(
    computeFlaggedForReview({
      overallScore: 80,
      dimensions: dims,
      requirements: reqs,
      matches,
    }),
    true,
  );
});

test("computeFlaggedForReview: unmatchable nice-to-have alone does not flag", () => {
  const dims: DimensionResult[] = [
    emptyDim("technical_skills", {
      totalMustHaves: 1,
      matchedMustHaves: 1,
      unmatchableCount: 1,
      score: 100,
    }),
    emptyDim("domain_knowledge"),
    emptyDim("experience_level"),
    emptyDim("role_fit"),
  ];
  const reqs = [
    req("a", { hardness: "must_have" }),
    req("b", { hardness: "nice_to_have", matchability: "unmatchable" }),
  ];
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "unmatched", matcher: "skipped" }),
  ];
  assert.equal(
    computeFlaggedForReview({
      overallScore: 80,
      dimensions: dims,
      requirements: reqs,
      matches,
    }),
    false,
  );
});

// ---------- collectUnscoredRequirements ----------------------------------

test("collectUnscoredRequirements: includes unmatchable regardless of verdict", () => {
  const reqs = [
    req("a", { matchability: "unmatchable" }),
    req("b", { matchability: "tokenizable" }),
  ];
  const matches = [
    match("a", { verdict: "unmatched", matcher: "skipped" }),
    match("b", { verdict: "matched" }),
  ];
  const out = collectUnscoredRequirements(reqs, matches);
  assert.deepEqual(
    out.map((r) => r.id),
    ["a"],
  );
});

test("collectUnscoredRequirements: includes soft-uncertain", () => {
  const reqs = [
    req("a", { matchability: "soft" }),
    req("b", { matchability: "tokenizable" }),
  ];
  const matches = [
    match("a", { verdict: "uncertain", matcher: "soft_llm" }),
    match("b", { verdict: "matched" }),
  ];
  const out = collectUnscoredRequirements(reqs, matches);
  assert.deepEqual(
    out.map((r) => r.id),
    ["a"],
  );
});

test("collectUnscoredRequirements: excludes scorable matched/unmatched", () => {
  const reqs = [
    req("a", { matchability: "tokenizable" }),
    req("b", { matchability: "soft" }),
  ];
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "unmatched", matcher: "soft_llm" }),
  ];
  const out = collectUnscoredRequirements(reqs, matches);
  assert.deepEqual(out, []);
});

test("collectUnscoredRequirements: order matches requirements[]", () => {
  const reqs = [
    req("a", { matchability: "tokenizable" }),
    req("b", { matchability: "unmatchable" }),
    req("c", { matchability: "soft" }),
    req("d", { matchability: "unmatchable" }),
  ];
  const matches = [
    match("a", { verdict: "matched" }),
    match("b", { verdict: "unmatched", matcher: "skipped" }),
    match("c", { verdict: "uncertain", matcher: "soft_llm" }),
    match("d", { verdict: "unmatched", matcher: "skipped" }),
  ];
  const out = collectUnscoredRequirements(reqs, matches);
  assert.deepEqual(
    out.map((r) => r.id),
    ["b", "c", "d"],
  );
});

// Sanity: DIMENSION_WEIGHTS sum to 1.0
test("DIMENSION_WEIGHTS sum to 1.0", () => {
  const sum = ALL_DIMENSIONS.reduce((s, k) => s + DIMENSION_WEIGHTS[k], 0);
  assert.ok(Math.abs(sum - 1.0) < 1e-9, `sum = ${sum}`);
});
