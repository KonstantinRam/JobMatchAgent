import { test } from "node:test";
import assert from "node:assert/strict";
import { reportCompleteness } from "../profileCompleteness.js";
import { EMPTY_PROFILE } from "../types.js";
import type { BackgroundProfile } from "../types.js";

function makeProfile(overrides: Partial<BackgroundProfile> = {}): BackgroundProfile {
  return JSON.parse(
    JSON.stringify({ ...EMPTY_PROFILE, ...overrides }),
  ) as BackgroundProfile;
}

test("EMPTY_PROFILE → not ready, all three sections missing", () => {
  const r = reportCompleteness(EMPTY_PROFILE);
  assert.equal(r.isReady, false);
  assert.deepEqual(
    [...r.missingSections].sort(),
    ["experience", "identity", "skills"],
  );
  assert.ok(r.notes.length <= 5);
});

test("name + headline only → identity present, others missing", () => {
  const r = reportCompleteness(makeProfile({ name: "Ada", headline: "engineer" }));
  assert.equal(r.isReady, false);
  assert.ok(!r.missingSections.includes("identity"));
  assert.ok(r.missingSections.includes("experience"));
  assert.ok(r.missingSections.includes("skills"));
});

test("no experience array but long summary → experience present", () => {
  const longSummary = "a".repeat(101);
  const r = reportCompleteness(
    makeProfile({ name: "Ada", headline: "engineer", summary: longSummary }),
  );
  assert.ok(!r.missingSections.includes("experience"));
});

test("a project with non-empty techStack → skills present", () => {
  const r = reportCompleteness(
    makeProfile({
      name: "Ada",
      headline: "engineer",
      projects: [
        {
          name: "p",
          summary: "s",
          techStack: ["TypeScript"],
          outcomes: [],
        },
      ],
    }),
  );
  assert.ok(!r.missingSections.includes("skills"));
});

test("fully populated profile → ready, no missing sections, notes capped at 5", () => {
  const r = reportCompleteness(
    makeProfile({
      name: "Ada",
      headline: "engineer",
      summary: "Pioneer of computation.",
      experience: [
        {
          role: "Engineer",
          company: "Acme",
          startDate: "2020-01",
          endDate: null,
          highlights: ["shipped X"],
        },
      ],
      projects: [
        {
          name: "Notes",
          summary: "s",
          techStack: ["TypeScript"],
          outcomes: ["o"],
        },
      ],
      skills: [{ category: "languages", skills: ["TypeScript"] }],
      education: [
        {
          institution: "MIT",
          degree: "BSc",
          field: "CS",
          endDate: "2018-06",
        },
      ],
    }),
  );
  assert.equal(r.isReady, true);
  assert.deepEqual(r.missingSections, []);
  assert.ok(r.notes.length <= 5);
});
