import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJob } from "../extractJob.js";
import { FakeLLMProvider } from "./_fakeLlm.js";
import type { JobPosting } from "../types.js";

const validPosting: JobPosting = {
  title: "Senior Engineer",
  company: "Acme",
  location: "Remote",
  responsibilities: ["Build features", "Mentor peers"],
  requirements: [
    {
      id: "req_001",
      text: "5+ years of TypeScript",
      dimension: "technical_skills",
      hardness: "must_have",
      matchability: "tokenizable",
      skillTokens: ["typescript"],
      yearsRequired: 5,
    },
    {
      id: "req_002",
      text: "comfortable owning ambiguous initiatives",
      dimension: "role_fit",
      hardness: "must_have",
      matchability: "soft",
    },
    {
      id: "req_003",
      text: "willing to travel 50%",
      dimension: "role_fit",
      hardness: "nice_to_have",
      matchability: "unmatchable",
    },
  ],
  toneAndCulture: "Collaborative and pragmatic.",
  rawText: "Original posting text from the model.",
};

test("extractJob: happy path parses a valid posting", async () => {
  const llm = new FakeLLMProvider(validPosting);
  const result = await extractJob(llm, {
    kind: "text",
    content: "the job",
  });
  assert.equal(result.title, "Senior Engineer");
  assert.equal(result.requirements.length, 3);
  assert.equal(result.requirements[0].matchability, "tokenizable");
  assert.equal(result.requirements[1].matchability, "soft");
  assert.equal(result.requirements[2].matchability, "unmatchable");
});

test("extractJob: rawText is overwritten with input.content for text input", async () => {
  const llm = new FakeLLMProvider(validPosting);
  const result = await extractJob(llm, {
    kind: "text",
    content: "MY ORIGINAL TEXT — verbatim",
  });
  assert.equal(result.rawText, "MY ORIGINAL TEXT — verbatim");
});

test("extractJob: tokenizable requirement missing skillTokens is rejected", async () => {
  const bad = {
    ...validPosting,
    requirements: [
      {
        id: "req_001",
        text: "TypeScript",
        dimension: "technical_skills",
        hardness: "must_have",
        matchability: "tokenizable",
        // skillTokens missing
        yearsRequired: null,
      },
    ],
  };
  const llm = new FakeLLMProvider(bad);
  await assert.rejects(
    () => extractJob(llm, { kind: "text", content: "x" }),
    /invalid JobPosting/,
  );
});

test("extractJob: tokenizable skillTokens with uppercase is rejected", async () => {
  const bad = {
    ...validPosting,
    requirements: [
      {
        id: "req_001",
        text: "TypeScript",
        dimension: "technical_skills",
        hardness: "must_have",
        matchability: "tokenizable",
        skillTokens: ["TypeScript"],
        yearsRequired: null,
      },
    ],
  };
  const llm = new FakeLLMProvider(bad);
  await assert.rejects(
    () => extractJob(llm, { kind: "text", content: "x" }),
    /invalid JobPosting/,
  );
});

test("extractJob: soft requirement with skillTokens is rejected", async () => {
  const bad = {
    ...validPosting,
    requirements: [
      {
        id: "req_001",
        text: "comfortable with ambiguity",
        dimension: "role_fit",
        hardness: "must_have",
        matchability: "soft",
        skillTokens: ["typescript"],
      },
    ],
  };
  const llm = new FakeLLMProvider(bad);
  await assert.rejects(
    () => extractJob(llm, { kind: "text", content: "x" }),
    /invalid JobPosting/,
  );
});

test("extractJob: duplicate requirement ids are rejected", async () => {
  const bad = {
    ...validPosting,
    requirements: [
      {
        id: "req_001",
        text: "TypeScript",
        dimension: "technical_skills",
        hardness: "must_have",
        matchability: "tokenizable",
        skillTokens: ["typescript"],
        yearsRequired: null,
      },
      {
        id: "req_001",
        text: "Python",
        dimension: "technical_skills",
        hardness: "must_have",
        matchability: "tokenizable",
        skillTokens: ["python"],
        yearsRequired: null,
      },
    ],
  };
  const llm = new FakeLLMProvider(bad);
  await assert.rejects(
    () => extractJob(llm, { kind: "text", content: "x" }),
    /Duplicate requirement id/,
  );
});

test("extractJob: unknown dimension value is rejected", async () => {
  const bad = {
    ...validPosting,
    requirements: [
      {
        id: "req_001",
        text: "Lead a team",
        dimension: "leadership",
        hardness: "must_have",
        matchability: "soft",
      },
    ],
  };
  const llm = new FakeLLMProvider(bad);
  await assert.rejects(
    () => extractJob(llm, { kind: "text", content: "x" }),
    /invalid JobPosting/,
  );
});
