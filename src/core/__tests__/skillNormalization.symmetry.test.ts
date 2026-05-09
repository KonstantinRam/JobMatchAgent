import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJob } from "../extractJob.js";
import { normalizeProfile } from "../normalizeProfile.js";
import { FakeLLMProvider } from "./_fakeLlm.js";
import type { BackgroundProfile, JobPosting } from "../types.js";

/**
 * Symmetry test for skill-token normalization.
  * Both pipelines must converge on the same canonical token.
 */

const baseProfile: BackgroundProfile = {
  name: "Test User",
  headline: "Engineer",
  summary: "summary",
  experience: [],
  projects: [],
  skills: [],
  education: [],
};

function buildJobPosting(skillToken: string): JobPosting {
  return {
    title: "Engineer",
    company: null,
    location: null,
    responsibilities: [],
    requirements: [
      {
        id: "req_001",
        text: "skill required",
        dimension: "technical_skills",
        hardness: "must_have",
        matchability: "tokenizable",
        skillTokens: [skillToken],
        yearsRequired: null,
      },
    ],
    toneAndCulture: null,
    rawText: "raw",
  };
}

async function jdToken(rawPhrase: string): Promise<string> {
  const llm = new FakeLLMProvider(buildJobPosting(rawPhrase));
  const posting = await extractJob(llm, { kind: "text", content: "x" });
  const req = posting.requirements[0];
  assert.ok(
    req.skillTokens && req.skillTokens.length === 1,
    `expected exactly one skillToken on JD side for raw=${rawPhrase}`,
  );
  return req.skillTokens![0];
}

function profileToken(rawPhrase: string): string {
  const profile: BackgroundProfile = {
    ...baseProfile,
    skills: [{ category: "languages", skills: [rawPhrase] }],
  };
  const claims = normalizeProfile(profile);
  assert.equal(
    claims.skills.length,
    1,
    `expected exactly one ClaimSet skill for raw=${rawPhrase}`,
  );
  return claims.skills[0].skillToken;
}

const aliasTable: Array<{ raw: string; expected: string }> = [
  { raw: "js", expected: "javascript" },
  { raw: "ts", expected: "typescript" },
  { raw: "k8s", expected: "kubernetes" },
  { raw: "postgres", expected: "postgresql" },
  { raw: "py", expected: "python" },
  { raw: "node-js", expected: "node" },
  { raw: "react-js", expected: "react" },
  { raw: "typescript-5", expected: "typescript" }, // version stripping
  { raw: "python3", expected: "python" },          // version stripping
  { raw: "kebab-case-thing", expected: "kebab-case-thing" }, // identity
];

for (const { raw, expected } of aliasTable) {
  test(`symmetry: '${raw}' → '${expected}' on both pipelines`, async () => {
    const fromJD = await jdToken(raw);
    const fromProfile = profileToken(raw);
    assert.equal(
      fromJD,
      expected,
      `JD-side token mismatch for raw=${raw}`,
    );
    assert.equal(
      fromProfile,
      expected,
      `profile-side token mismatch for raw=${raw}`,
    );
    assert.equal(
      fromJD,
      fromProfile,
      `pipelines diverged for raw=${raw}: JD=${fromJD} vs profile=${fromProfile}`,
    );
  });
}

test("symmetry: full alias table converges to identical tokens across both pipelines", async () => {
  for (const { raw, expected } of aliasTable) {
    const fromJD = await jdToken(raw);
    const fromProfile = profileToken(raw);
    assert.equal(fromJD, fromProfile, `divergence on raw=${raw}`);
    assert.equal(fromJD, expected, `JD missed canonical for raw=${raw}`);
    assert.equal(fromProfile, expected, `profile missed canonical for raw=${raw}`);
  }
});

/**
 * The interesting symmetry: the JD side and the profile side typically
 * receive *different surface forms* of the same skill — the LLM emits
 * lowercase/kebab tokens (constrained by extractJob's schema), while the
 * profile holds whatever the user typed. Both pipelines must still land
 * on the same canonical token.
 */
const crossFormPairs: Array<{
  jdRaw: string;
  profileRaw: string;
  expected: string;
}> = [
  { jdRaw: "js", profileRaw: "JavaScript", expected: "javascript" },
  { jdRaw: "ts", profileRaw: "TypeScript", expected: "typescript" },
  { jdRaw: "k8s", profileRaw: "Kubernetes", expected: "kubernetes" },
  { jdRaw: "postgres", profileRaw: "PostgreSQL", expected: "postgresql" },
  { jdRaw: "py", profileRaw: "Python", expected: "python" },
  { jdRaw: "node-js", profileRaw: "Node.js", expected: "node" },
  { jdRaw: "react-js", profileRaw: "React.js", expected: "react" },
  { jdRaw: "python3", profileRaw: "Python 3.11", expected: "python" },
  { jdRaw: "typescript-5", profileRaw: "TypeScript 5.0", expected: "typescript" },
  { jdRaw: "postgres", profileRaw: "  Postgres  ", expected: "postgresql" },
];

for (const { jdRaw, profileRaw, expected } of crossFormPairs) {
  test(`cross-form symmetry: JD='${jdRaw}' & profile='${profileRaw}' both → '${expected}'`, async () => {
    const fromJD = await jdToken(jdRaw);
    const fromProfile = profileToken(profileRaw);
    assert.equal(
      fromJD,
      expected,
      `JD-side normalization wrong for ${jdRaw}`,
    );
    assert.equal(
      fromProfile,
      expected,
      `profile-side normalization wrong for ${profileRaw}`,
    );
    assert.equal(
      fromJD,
      fromProfile,
      `pipelines diverged: JD(${jdRaw})=${fromJD} vs profile(${profileRaw})=${fromProfile}`,
    );
  });
}

/**
 * Negative cases: when the JD and profile receive obviously different raw
 * phrases that map to different canonical tokens, the symmetry assertion
 * must fail. These tests pin that the methodology actually detects
 * divergence — they are guard-rails on the happy-path tests above.
 */
const divergentPairs: Array<{
  jdRaw: string;
  profileRaw: string;
  jdExpected: string;
  profileExpected: string;
}> = [
  {
    jdRaw: "js",
    profileRaw: "Python",
    jdExpected: "javascript",
    profileExpected: "python",
  },
  {
    jdRaw: "k8s",
    profileRaw: "PostgreSQL",
    jdExpected: "kubernetes",
    profileExpected: "postgresql",
  },
  {
    jdRaw: "react-js",
    profileRaw: "TypeScript",
    jdExpected: "react",
    profileExpected: "typescript",
  },
];

for (const { jdRaw, profileRaw, jdExpected, profileExpected } of divergentPairs) {
  test(`divergence: JD='${jdRaw}' vs profile='${profileRaw}' produce different tokens`, async () => {
    const fromJD = await jdToken(jdRaw);
    const fromProfile = profileToken(profileRaw);
    assert.equal(fromJD, jdExpected);
    assert.equal(fromProfile, profileExpected);
    assert.notEqual(
      fromJD,
      fromProfile,
      `expected divergence between JD=${jdRaw} and profile=${profileRaw}`,
    );
  });
}
