import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProfile,
} from "../normalizeProfile.js";
import type { BackgroundProfile } from "../types.js";


const baseProfile: BackgroundProfile = {
  name: "Test User",
  headline: "Engineer",
  summary: "Top-level summary",
  experience: [],
  projects: [],
  skills: [],
  education: [],
};



// ---------- normalizeProfile ----------------------------------------------

test("totalYearsProfessional spans earliest startDate to latest endDate (null = now)", () => {
  const profile: BackgroundProfile = {
    ...baseProfile,
    experience: [
      {
        role: "Eng",
        company: "B",
        startDate: "2022-01",
        endDate: null,
        highlights: [],
      },
      {
        role: "Eng",
        company: "A",
        startDate: "2020-01",
        endDate: "2022-01",
        highlights: [],
      },
    ],
  };
  const frozenNow = new Date(Date.UTC(2024, 0, 1));
  const claims = normalizeProfile(profile, frozenNow);
  // 2020-01 → 2024-01 ≈ 4.0 years
  assert.ok(
    Math.abs(claims.experienceTotals.totalYearsProfessional - 4.0) <= 0.1,
    `expected ≈4.0, got ${claims.experienceTotals.totalYearsProfessional}`,
  );
});

test("a skill in profile.skills AND a project.techStack appears once with both refs", () => {
  const profile: BackgroundProfile = {
    ...baseProfile,
    experience: [
      {
        role: "Eng",
        company: "A",
        startDate: "2020-01",
        endDate: "2024-01",
        highlights: [],
      },
    ],
    projects: [
      {
        name: "P",
        summary: "S",
        techStack: ["TypeScript"],
        outcomes: [],
      },
    ],
    skills: [{ category: "languages", skills: ["TypeScript"] }],
  };
  const claims = normalizeProfile(profile);
  const ts = claims.skills.filter((s) => s.skillToken === "typescript");
  assert.equal(ts.length, 1, "expected exactly one 'typescript' claim");
  assert.equal(ts[0].evidenceRefs.length, 2, "expected both evidence refs");
  assert.ok(ts[0].evidenceRefs.some((r) => r.startsWith("skills[")));
  assert.ok(ts[0].evidenceRefs.some((r) => r.startsWith("projects[")));
});

test("a skill only in techStack gets years = 0", () => {
  const profile: BackgroundProfile = {
    ...baseProfile,
    experience: [
      {
        role: "Eng",
        company: "A",
        startDate: "2020-01",
        endDate: null,
        highlights: [],
      },
    ],
    projects: [
      {
        name: "P",
        summary: "S",
        techStack: ["Rust"],
        outcomes: [],
      },
    ],
  };
  const frozenNow = new Date(Date.UTC(2024, 0, 1));
  const claims = normalizeProfile(profile, frozenNow);
  const rust = claims.skills.find((s) => s.skillToken === "rust");
  assert.ok(rust, "rust claim missing");
  assert.equal(rust!.years, 0);
});

test("a skill only in profile.skills gets years = totalYearsProfessional", () => {
  const profile: BackgroundProfile = {
    ...baseProfile,
    experience: [
      {
        role: "Eng",
        company: "A",
        startDate: "2020-01",
        endDate: "2024-01",
        highlights: [],
      },
    ],
    skills: [{ category: "lang", skills: ["Python"] }],
  };
  const claims = normalizeProfile(profile);
  const total = claims.experienceTotals.totalYearsProfessional;
  assert.ok(total > 0, "sanity: total years should be > 0");
  const py = claims.skills.find((s) => s.skillToken === "python");
  assert.ok(py, "python claim missing");
  assert.equal(py!.years, total);
});

test("narrativeBullets includes summary, every highlight, every project summary, every outcome", () => {
  const profile: BackgroundProfile = {
    ...baseProfile,
    summary: "Top-level summary",
    experience: [
      {
        role: "Eng",
        company: "A",
        startDate: "2020-01",
        endDate: null,
        highlights: ["h1", "h2"],
      },
      {
        role: "Eng",
        company: "B",
        startDate: "2018-01",
        endDate: "2020-01",
        highlights: ["h3"],
      },
    ],
    projects: [
      { name: "P1", summary: "ps1", techStack: [], outcomes: ["o1", "o2"] },
      { name: "P2", summary: "ps2", techStack: [], outcomes: ["o3"] },
    ],
  };
  const claims = normalizeProfile(profile);
  // 1 (summary) + 3 (highlights) + 2 (project summaries) + 3 (outcomes) = 9
  assert.equal(claims.narrativeBullets.length, 9);

  const sources = claims.narrativeBullets.map((b) => b.source);
  for (const expected of [
    "summary",
    "experience[0].highlights[0]",
    "experience[0].highlights[1]",
    "experience[1].highlights[0]",
    "projects[0].summary",
    "projects[1].summary",
    "projects[0].outcomes[0]",
    "projects[0].outcomes[1]",
    "projects[1].outcomes[0]",
  ]) {
    assert.ok(
      sources.includes(expected),
      `missing narrative bullet source: ${expected}`,
    );
  }
});

test("empty experience → totalYearsProfessional = 0; skills get years = 0", () => {
  const profile: BackgroundProfile = {
    ...baseProfile,
    skills: [{ category: "lang", skills: ["Python"] }],
  };
  const claims = normalizeProfile(profile);
  assert.equal(claims.experienceTotals.totalYearsProfessional, 0);
  const py = claims.skills.find((s) => s.skillToken === "python");
  assert.ok(py, "python claim missing");
  assert.equal(py!.years, 0);
});
