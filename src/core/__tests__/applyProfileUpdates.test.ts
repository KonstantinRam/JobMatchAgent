import { test } from "node:test";
import assert from "node:assert/strict";
import { applyProfileUpdates } from "../applyProfileUpdates.js";
import { EMPTY_PROFILE } from "../types.js";
import type { BackgroundProfile, ExperienceEntry } from "../types.js";

function makeProfile(overrides: Partial<BackgroundProfile> = {}): BackgroundProfile {
  return JSON.parse(
    JSON.stringify({ ...EMPTY_PROFILE, ...overrides }),
  ) as BackgroundProfile;
}

const SAMPLE_EXPERIENCE: ExperienceEntry = {
  role: "Engineer",
  company: "Acme",
  startDate: "2020-01",
  endDate: null,
  highlights: ["shipped X", "owned Y"],
};

test("a) input profile is not mutated", () => {
  const input = makeProfile({
    name: "Ada",
    headline: "engineer",
    summary: "short",
    experience: [SAMPLE_EXPERIENCE],
  });
  const snapshot = JSON.parse(JSON.stringify(input));

  const out = applyProfileUpdates(input, [
    { kind: "set_identity", name: "Bob" },
    { kind: "add_experience", entry: SAMPLE_EXPERIENCE },
    { kind: "edit_experience", index: 0, entry: { role: "Lead" } },
  ]);

  // Reference: returned object is a new reference.
  assert.notEqual(out, input);
  // Deep-equality: input matches its pre-call snapshot.
  assert.deepEqual(input, snapshot);
});

test("b) set_identity with all three fields updates all three", () => {
  const out = applyProfileUpdates(makeProfile(), [
    {
      kind: "set_identity",
      name: "Ada",
      headline: "Programmer",
      summary: "Pioneer.",
    },
  ]);
  assert.equal(out.name, "Ada");
  assert.equal(out.headline, "Programmer");
  assert.equal(out.summary, "Pioneer.");
});

test("c) set_identity with only headline updates only headline", () => {
  const before = makeProfile({
    name: "Ada",
    headline: "old",
    summary: "keep me",
  });
  const out = applyProfileUpdates(before, [
    { kind: "set_identity", headline: "new" },
  ]);
  assert.equal(out.name, "Ada");
  assert.equal(out.headline, "new");
  assert.equal(out.summary, "keep me");
});

test("d) add_experience appends", () => {
  const out = applyProfileUpdates(makeProfile({ experience: [SAMPLE_EXPERIENCE] }), [
    {
      kind: "add_experience",
      entry: { ...SAMPLE_EXPERIENCE, role: "Second", company: "Beta" },
    },
  ]);
  assert.equal(out.experience.length, 2);
  assert.equal(out.experience[1].role, "Second");
  assert.equal(out.experience[1].company, "Beta");
});

test("e) edit_experience updates only the supplied field", () => {
  const out = applyProfileUpdates(makeProfile({ experience: [SAMPLE_EXPERIENCE] }), [
    { kind: "edit_experience", index: 0, entry: { endDate: "2024-12" } },
  ]);
  assert.equal(out.experience[0].endDate, "2024-12");
  // Other fields untouched.
  assert.equal(out.experience[0].role, SAMPLE_EXPERIENCE.role);
  assert.equal(out.experience[0].company, SAMPLE_EXPERIENCE.company);
  assert.equal(out.experience[0].startDate, SAMPLE_EXPERIENCE.startDate);
  assert.deepEqual(out.experience[0].highlights, SAMPLE_EXPERIENCE.highlights);
});

test("f) edit_experience with index out of range throws with op-index in message", () => {
  const before = makeProfile({ experience: [SAMPLE_EXPERIENCE] });
  assert.throws(
    () =>
      applyProfileUpdates(before, [
        { kind: "set_identity", name: "Ada" },
        { kind: "edit_experience", index: 5, entry: { role: "x" } },
      ]),
    (err: Error) =>
      err.message.includes("Op #1") && err.message.includes("edit_experience"),
  );
});

test("g) remove_experience splices", () => {
  const second: ExperienceEntry = { ...SAMPLE_EXPERIENCE, role: "Second" };
  const out = applyProfileUpdates(
    makeProfile({ experience: [SAMPLE_EXPERIENCE, second] }),
    [{ kind: "remove_experience", index: 0 }],
  );
  assert.equal(out.experience.length, 1);
  assert.equal(out.experience[0].role, "Second");
});

test("h) add_skills with new category creates the group", () => {
  const out = applyProfileUpdates(makeProfile(), [
    { kind: "add_skills", category: "languages", skills: ["TypeScript", "Go"] },
  ]);
  assert.equal(out.skills.length, 1);
  assert.equal(out.skills[0].category, "languages");
  assert.deepEqual(out.skills[0].skills, ["TypeScript", "Go"]);
});

test("i) add_skills appends and dedupes case-insensitively, preserving existing case", () => {
  const before = makeProfile({
    skills: [{ category: "languages", skills: ["TypeScript"] }],
  });
  const out = applyProfileUpdates(before, [
    {
      kind: "add_skills",
      category: "languages",
      skills: ["typescript", "Go"],
    },
  ]);
  assert.equal(out.skills.length, 1);
  // Existing "TypeScript" preserved (not overwritten by "typescript"); "Go" appended.
  assert.deepEqual(out.skills[0].skills, ["TypeScript", "Go"]);
});

test("j) remove_skills removes case-insensitively", () => {
  const before = makeProfile({
    skills: [{ category: "languages", skills: ["TypeScript", "Go", "Rust"] }],
  });
  const out = applyProfileUpdates(before, [
    { kind: "remove_skills", category: "languages", skills: ["typescript"] },
  ]);
  assert.equal(out.skills.length, 1);
  assert.deepEqual(out.skills[0].skills, ["Go", "Rust"]);
});

test("k) sequence: add_experience then edit_experience(last) both apply", () => {
  const before = makeProfile({ experience: [SAMPLE_EXPERIENCE] });
  const out = applyProfileUpdates(before, [
    {
      kind: "add_experience",
      entry: { ...SAMPLE_EXPERIENCE, role: "Second", company: "Beta" },
    },
    { kind: "edit_experience", index: 1, entry: { endDate: "2025-06" } },
  ]);
  assert.equal(out.experience.length, 2);
  assert.equal(out.experience[1].role, "Second");
  assert.equal(out.experience[1].endDate, "2025-06");
});

test("l) empty ops array returns a deep-equal copy of the profile", () => {
  const input = makeProfile({
    name: "Ada",
    headline: "h",
    summary: "s",
    experience: [SAMPLE_EXPERIENCE],
    skills: [{ category: "math", skills: ["calculus"] }],
  });
  const out = applyProfileUpdates(input, []);
  assert.deepEqual(out, input);
  assert.notEqual(out, input);
  // Deep clone — nested arrays should also be different references.
  assert.notEqual(out.experience, input.experience);
});
