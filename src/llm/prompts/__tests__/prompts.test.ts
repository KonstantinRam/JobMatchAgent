import { test } from "node:test";
import assert from "node:assert/strict";
import { buildExtractJobPrompt } from "../extractJob.js";
import { buildSoftMatchPrompt } from "../softMatch.js";
import { buildTriageNotePrompt } from "../triageNote.js";
import { buildChatPrompt } from "../chat.js";
import type {
  BackgroundProfile,
  ChatMessage,
  ChatThread,
  ClaimSet,
  DimensionResult,
  JobPosting,
  JobRequirement,
  LLMContentBlock,
  ProfileCompletenessReport,
  RequirementMatch,
} from "../../../core/types.js";

function asBlocks(content: string | LLMContentBlock[]): LLMContentBlock[] {
  assert.ok(Array.isArray(content), "expected content to be an array of blocks");
  return content;
}

function asText(content: string | LLMContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// ============================================================================
// extractJob
// ============================================================================

test("extractJob: returns non-empty system and at least one message", () => {
  const out = buildExtractJobPrompt({ kind: "text", content: "x" });
  assert.ok(out.system.length > 0);
  assert.ok(out.messages.length >= 1);
});

test("extractJob: pdf input becomes a document block with application/pdf", () => {
  const bytes = Buffer.from("%PDF-1.4 fake");
  const out = buildExtractJobPrompt({ kind: "pdf", bytes });
  const blocks = asBlocks(out.messages[0].content);
  assert.equal(blocks[0].type, "document");
  assert.equal((blocks[0] as { mediaType: string }).mediaType, "application/pdf");
});

test("extractJob: image input becomes an image block with the right mediaType", () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const out = buildExtractJobPrompt({
    kind: "image",
    bytes,
    mediaType: "image/png",
  });
  const blocks = asBlocks(out.messages[0].content);
  assert.equal(blocks[0].type, "image");
  assert.equal((blocks[0] as { mediaType: string }).mediaType, "image/png");
});

test("extractJob: text input is text-only (no document/image blocks)", () => {
  const out = buildExtractJobPrompt({
    kind: "text",
    content: "Senior TS engineer",
  });
  const content = out.messages[0].content;
  if (typeof content !== "string") {
    for (const b of content) {
      assert.notEqual(b.type, "document");
      assert.notEqual(b.type, "image");
    }
  }
  assert.match(asText(content), /Senior TS engineer/);
});

// ============================================================================
// softMatch
// ============================================================================

test("softMatch: embeds requirement text and every bullet's source ref", () => {
  const requirement: JobRequirement = {
    id: "req_001",
    text: "comfortable driving ambiguous, cross-team initiatives",
    dimension: "role_fit",
    hardness: "must_have",
    matchability: "soft",
  };
  const claimSet: ClaimSet = {
    skills: [],
    experienceTotals: { totalYearsProfessional: 7 },
    narrativeBullets: [
      {
        text: "Led migration across 3 teams",
        source: "experience[0].highlights[0]",
      },
      {
        text: "Drove cross-org RFC adoption",
        source: "experience[1].highlights[2]",
      },
      { text: "Built initial prototype", source: "projects[0].outcomes[0]" },
    ],
  };

  const out = buildSoftMatchPrompt(requirement, claimSet);
  assert.ok(out.system.length > 0);
  assert.ok(out.messages.length >= 1);

  const text = asText(out.messages[0].content);
  assert.match(
    text,
    /comfortable driving ambiguous, cross-team initiatives/,
    "requirement text must appear verbatim",
  );
  for (const bullet of claimSet.narrativeBullets) {
    assert.ok(
      text.includes(bullet.source),
      `expected source ref ${bullet.source} in user message`,
    );
  }
});

// ============================================================================
// triageNote
// ============================================================================

test("triageNote: embeds overallScore and dimension scores into user message", () => {
  const jobPosting: JobPosting = {
    title: "Senior Engineer",
    company: "Acme",
    location: null,
    responsibilities: [],
    requirements: [
      {
        id: "req_001",
        text: "5+ years TypeScript",
        dimension: "technical_skills",
        hardness: "must_have",
        matchability: "tokenizable",
        skillTokens: ["typescript"],
        yearsRequired: 5,
      },
    ],
    toneAndCulture: null,
    rawText: "...",
  };
  const dimensions: DimensionResult[] = [
    {
      dimension: "technical_skills",
      totalMustHaves: 3,
      matchedMustHaves: 2,
      totalNiceToHaves: 1,
      matchedNiceToHaves: 1,
      uncertainCount: 0,
      unmatchableCount: 0,
      score: 0.82,
    },
    {
      dimension: "experience_level",
      totalMustHaves: 1,
      matchedMustHaves: 0,
      totalNiceToHaves: 0,
      matchedNiceToHaves: 0,
      uncertainCount: 1,
      unmatchableCount: 0,
      score: 0.41,
    },
  ];
  const matches: RequirementMatch[] = [
    {
      requirementId: "req_001",
      verdict: "matched",
      matcher: "tokenizer",
      evidence: ["skills.languages: typescript"],
    },
  ];

  const out = buildTriageNotePrompt({
    jobPosting,
    dimensions,
    matches,
    overallScore: 0.73,
    flaggedForReview: false,
  });
  assert.ok(out.system.length > 0);
  assert.ok(out.messages.length >= 1);

  const text = asText(out.messages[0].content);
  assert.ok(text.includes("0.73"), "overallScore must be embedded");
  assert.ok(text.includes("0.82"), "technical_skills score must be embedded");
  assert.ok(text.includes("0.41"), "experience_level score must be embedded");
});

// ============================================================================
// chat
// ============================================================================

const PROFILE: BackgroundProfile = {
  name: "Grace Hopper",
  headline: "Compiler pioneer",
  summary: "Invented the first compiler.",
  experience: [
    {
      role: "Mathematician",
      company: "US Navy",
      startDate: "1944-07",
      endDate: null,
      highlights: ["Worked on Mark I"],
    },
  ],
  projects: [],
  skills: [{ category: "languages", skills: ["COBOL"] }],
  education: [
    {
      institution: "Yale",
      degree: "PhD",
      field: "Mathematics",
      endDate: "1934-06",
    },
  ],
};

const COMPLETENESS: ProfileCompletenessReport = {
  isReady: true,
  missingSections: [],
  notes: [],
};

const ALL_OP_KINDS = [
  "set_identity",
  "add_experience",
  "edit_experience",
  "remove_experience",
  "add_project",
  "edit_project",
  "remove_project",
  "add_skills",
  "remove_skills",
  "add_education",
  "edit_education",
  "remove_education",
];

test("chat: system contains the candidate's name and the profile JSON", () => {
  const out = buildChatPrompt({
    profile: PROFILE,
    thread: { messages: [] },
    userMessage: "hello",
    completeness: COMPLETENESS,
  });
  assert.ok(out.system.length > 0);
  assert.ok(
    out.system.includes("Grace Hopper"),
    "system must include candidate name",
  );
  assert.ok(
    out.system.includes('"company": "US Navy"'),
    "system must include profile JSON content",
  );
});

test("chat: system mentions every ProfileUpdateOp kind", () => {
  const out = buildChatPrompt({
    profile: PROFILE,
    thread: { messages: [] },
    userMessage: "hello",
    completeness: COMPLETENESS,
  });
  for (const kind of ALL_OP_KINDS) {
    assert.ok(
      out.system.includes(kind),
      `system prompt missing op kind: ${kind}`,
    );
  }
});

test("chat: caps thread at 12 prior messages and appends the new user message", () => {
  const messages: ChatMessage[] = [];
  for (let i = 0; i < 20; i++) {
    messages.push({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    });
  }
  const thread: ChatThread = { messages };

  const out = buildChatPrompt({
    profile: PROFILE,
    thread,
    userMessage: "the new one",
    completeness: COMPLETENESS,
  });

  assert.equal(out.messages.length, 13, "should be 12 cap + 1 new user");

  const first = out.messages[0];
  assert.equal(typeof first.content, "string");
  assert.notEqual(
    first.content,
    "turn 0",
    "first message should NOT be original turn 0 — older turns get dropped",
  );
  // last 12 of 20 are turns 8..19 → first kept is "turn 8".
  assert.equal(first.content, "turn 8");

  const last = out.messages[out.messages.length - 1];
  assert.equal(last.role, "user");
  assert.equal(last.content, "the new one");
});

test("chat: returns non-empty system and at least one message", () => {
  const out = buildChatPrompt({
    profile: PROFILE,
    thread: { messages: [] },
    userMessage: "hi",
    completeness: COMPLETENESS,
  });
  assert.ok(out.system.length > 0);
  assert.ok(out.messages.length >= 1);
});
