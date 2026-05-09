import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchRequirements,
  softMatch,
  tokenizerMatch,
} from "../matchRequirements.js";
import { FakeLLMProvider, ThrowingLLMProvider } from "./_fakeLlm.js";
import type { ClaimSet, JobRequirement } from "../types.js";

function tokenizableReq(
  id: string,
  skillTokens: string[],
  yearsRequired: number | null,
): JobRequirement {
  return {
    id,
    text: `req ${id}`,
    dimension: "technical_skills",
    hardness: "must_have",
    matchability: "tokenizable",
    skillTokens,
    yearsRequired,
  };
}

function softReq(id: string): JobRequirement {
  return {
    id,
    text: `soft req ${id}`,
    dimension: "role_fit",
    hardness: "must_have",
    matchability: "soft",
  };
}

function unmatchableReq(id: string): JobRequirement {
  return {
    id,
    text: `unmatchable ${id}`,
    dimension: "role_fit",
    hardness: "nice_to_have",
    matchability: "unmatchable",
  };
}

const emptyClaimSet: ClaimSet = {
  skills: [],
  experienceTotals: { totalYearsProfessional: 0 },
  narrativeBullets: [],
};

// ---------- tokenizerMatch ------------------------------------------------

test("tokenizerMatch: throws when matchability is not tokenizable", () => {
  const req = softReq("req_001");
  assert.throws(() => tokenizerMatch(req, emptyClaimSet));
});

test("tokenizerMatch: throws when skillTokens is missing", () => {
  const req: JobRequirement = {
    id: "req_001",
    text: "x",
    dimension: "technical_skills",
    hardness: "must_have",
    matchability: "tokenizable",
    yearsRequired: null,
  };
  assert.throws(() => tokenizerMatch(req, emptyClaimSet));
});

test("tokenizerMatch: throws when skillTokens is empty", () => {
  const req: JobRequirement = {
    id: "req_001",
    text: "x",
    dimension: "technical_skills",
    hardness: "must_have",
    matchability: "tokenizable",
    skillTokens: [],
    yearsRequired: null,
  };
  assert.throws(() => tokenizerMatch(req, emptyClaimSet));
});

test("tokenizerMatch: all tokens present, yearsRequired null → matched with union of refs", () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "typescript",
        years: 5,
        evidenceRefs: ["experience[0]", "skills[0]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 5 },
    narrativeBullets: [],
  };
  const req = tokenizableReq("req_001", ["typescript"], null);
  const result = tokenizerMatch(req, claimSet);
  assert.equal(result.verdict, "matched");
  assert.equal(result.matcher, "tokenizer");
  assert.deepEqual(result.evidence.sort(), ["experience[0]", "skills[0]"]);
  assert.equal(result.reasoning, undefined);
});

test("tokenizerMatch: one token missing → unmatched, evidence empty", () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "typescript",
        years: 5,
        evidenceRefs: ["experience[0]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 5 },
    narrativeBullets: [],
  };
  const req = tokenizableReq("req_001", ["typescript", "rust"], null);
  const result = tokenizerMatch(req, claimSet);
  assert.equal(result.verdict, "unmatched");
  assert.deepEqual(result.evidence, []);
  assert.equal(result.matcher, "tokenizer");
});

test("tokenizerMatch: yearsRequired=3, claim has years=5 → matched", () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "typescript",
        years: 5,
        evidenceRefs: ["experience[0]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 5 },
    narrativeBullets: [],
  };
  const req = tokenizableReq("req_001", ["typescript"], 3);
  const result = tokenizerMatch(req, claimSet);
  assert.equal(result.verdict, "matched");
  assert.deepEqual(result.evidence, ["experience[0]"]);
});

test("tokenizerMatch: yearsRequired=3, claim has years=1 → unmatched but evidence retained", () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "typescript",
        years: 1,
        evidenceRefs: ["experience[0]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 1 },
    narrativeBullets: [],
  };
  const req = tokenizableReq("req_001", ["typescript"], 3);
  const result = tokenizerMatch(req, claimSet);
  assert.equal(result.verdict, "unmatched");
  assert.deepEqual(result.evidence, ["experience[0]"]);
});

test("tokenizerMatch: yearsRequired=3, claim has years=0 (project-only) → unmatched", () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "typescript",
        years: 0,
        evidenceRefs: ["projects[0]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 0 },
    narrativeBullets: [],
  };
  const req = tokenizableReq("req_001", ["typescript"], 3);
  const result = tokenizerMatch(req, claimSet);
  assert.equal(result.verdict, "unmatched");
  assert.deepEqual(result.evidence, ["projects[0]"]);
});

test("tokenizerMatch: two tokens both with years >= required → matched, evidence dedupes", () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "typescript",
        years: 4,
        evidenceRefs: ["experience[0]", "skills[0]"],
      },
      {
        skillToken: "react",
        years: 3,
        evidenceRefs: ["experience[0]", "projects[1]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 4 },
    narrativeBullets: [],
  };
  const req = tokenizableReq("req_001", ["typescript", "react"], 3);
  const result = tokenizerMatch(req, claimSet);
  assert.equal(result.verdict, "matched");
  assert.deepEqual(result.evidence.sort(), [
    "experience[0]",
    "projects[1]",
    "skills[0]",
  ]);
});

// ---------- softMatch -----------------------------------------------------

test("softMatch: valid response → RequirementMatch with parsed fields", async () => {
  const llm = new FakeLLMProvider({
    verdict: "matched",
    evidence: ["experience[0].highlights[1]"],
    reasoning: "Bullet describes ownership of an ambiguous initiative.",
    confidence: 0.85,
  });
  const req = softReq("req_002");
  const result = await softMatch(llm, req, emptyClaimSet);
  assert.equal(result.requirementId, "req_002");
  assert.equal(result.verdict, "matched");
  assert.equal(result.matcher, "soft_llm");
  assert.deepEqual(result.evidence, ["experience[0].highlights[1]"]);
  assert.equal(
    result.reasoning,
    "Bullet describes ownership of an ambiguous initiative.",
  );
  assert.equal(result.llmConfidence, 0.85);
});

test("softMatch: verdict outside enum throws", async () => {
  const llm = new FakeLLMProvider({
    verdict: "maybe",
    evidence: [],
    reasoning: "x",
    confidence: 0.5,
  });
  await assert.rejects(() => softMatch(llm, softReq("req_002"), emptyClaimSet));
});

test("softMatch: confidence > 1 throws", async () => {
  const llm = new FakeLLMProvider({
    verdict: "matched",
    evidence: [],
    reasoning: "x",
    confidence: 1.5,
  });
  await assert.rejects(() => softMatch(llm, softReq("req_002"), emptyClaimSet));
});

// ---------- matchRequirements (orchestration) ----------------------------

test("matchRequirements: mixed tokenizable + soft + unmatchable, in order", async () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "typescript",
        years: 5,
        evidenceRefs: ["experience[0]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 5 },
    narrativeBullets: [
      { text: "Owned project end-to-end", source: "experience[0].highlights[0]" },
    ],
  };
  const llm = new FakeLLMProvider({
    verdict: "matched",
    evidence: ["experience[0].highlights[0]"],
    reasoning: "Bullet attests to ownership.",
    confidence: 0.8,
  });
  const reqs: JobRequirement[] = [
    tokenizableReq("req_001", ["typescript"], 3),
    softReq("req_002"),
    unmatchableReq("req_003"),
  ];
  const matches = await matchRequirements(llm, reqs, claimSet);
  assert.equal(matches.length, 3);
  assert.equal(matches[0].requirementId, "req_001");
  assert.equal(matches[0].matcher, "tokenizer");
  assert.equal(matches[0].verdict, "matched");
  assert.equal(matches[1].requirementId, "req_002");
  assert.equal(matches[1].matcher, "soft_llm");
  assert.equal(matches[1].verdict, "matched");
  assert.equal(matches[2].requirementId, "req_003");
  assert.equal(matches[2].matcher, "skipped");
  assert.equal(matches[2].verdict, "uncertain");
  assert.equal(matches[2].reasoning, "marked unmatchable at extraction");
});

test("matchRequirements: softMatch failure converts to uncertain, others succeed", async () => {
  const claimSet: ClaimSet = {
    skills: [
      {
        skillToken: "python",
        years: 4,
        evidenceRefs: ["experience[0]"],
      },
    ],
    experienceTotals: { totalYearsProfessional: 4 },
    narrativeBullets: [],
  };
  const llm = new ThrowingLLMProvider("network exploded");
  const reqs: JobRequirement[] = [
    tokenizableReq("req_001", ["python"], null),
    softReq("req_002"),
  ];
  const matches = await matchRequirements(llm, reqs, claimSet);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].verdict, "matched");
  assert.equal(matches[1].requirementId, "req_002");
  assert.equal(matches[1].matcher, "soft_llm");
  assert.equal(matches[1].verdict, "uncertain");
  assert.equal(matches[1].llmConfidence, 0);
  assert.match(matches[1].reasoning ?? "", /soft matcher failed: network exploded/);
});

test("matchRequirements: multiple soft requirements all fire softMatch", async () => {
  const llm = new FakeLLMProvider({
    verdict: "uncertain",
    evidence: [],
    reasoning: "thin signal",
    confidence: 0.4,
  });
  const reqs: JobRequirement[] = [
    softReq("req_001"),
    softReq("req_002"),
    softReq("req_003"),
  ];
  const matches = await matchRequirements(llm, reqs, emptyClaimSet);
  assert.equal(matches.length, 3);
  assert.equal(llm.callCount, 3);
  for (const m of matches) {
    assert.equal(m.matcher, "soft_llm");
    assert.equal(m.verdict, "uncertain");
  }
});
