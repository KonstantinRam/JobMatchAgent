import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { FileMatchHistory } from "../matchHistory.js";
import type { MatchAssessment } from "../types.js";

async function tmpDir(suffix: string): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `matchHistory-test-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${suffix}`,
  );
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

function makeAssessment(rawText: string, title = "Software Engineer"): MatchAssessment {
  return {
    jobPosting: {
      title,
      company: "Acme Corp",
      location: "Remote",
      responsibilities: ["Build things"],
      requirements: [],
      toneAndCulture: null,
      rawText,
    },
    claimSet: {
      skills: [],
      experienceTotals: { totalYearsProfessional: 0 },
      narrativeBullets: [],
    },
    matches: [],
    dimensions: [],
    overallScore: 0.75,
    flaggedForReview: false,
    unscoredRequirements: [],
    triageNote: "Looks reasonable.",
  };
}

test("list() returns [] for an empty directory", async () => {
  const dir = await tmpDir("empty");
  try {
    const history = new FileMatchHistory(dir);
    const result = await history.list();
    assert.deepEqual(result, []);
  } finally {
    await rmDir(dir);
  }
});

test("list() creates the directory if missing and returns []", async () => {
  const parent = await tmpDir("parent");
  const dir = path.join(parent, "matches-not-yet-created");
  try {
    const history = new FileMatchHistory(dir);
    const result = await history.list();
    assert.deepEqual(result, []);
    const stat = await fs.stat(dir);
    assert.equal(stat.isDirectory(), true);
  } finally {
    await rmDir(parent);
  }
});

test("save() then list() returns one summary; get() round-trips fields", async () => {
  const dir = await tmpDir("roundtrip");
  try {
    const history = new FileMatchHistory(dir);
    const assessment = makeAssessment("Job posting body alpha");
    const summary = await history.save(assessment);

    assert.equal(summary.jobTitle, assessment.jobPosting.title);
    assert.equal(summary.company, assessment.jobPosting.company);
    assert.equal(summary.overallScore, assessment.overallScore);
    assert.equal(summary.flaggedForReview, assessment.flaggedForReview);
    assert.match(summary.id, /^[A-Za-z0-9-]+$/);
    assert.match(summary.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    const list = await history.list();
    assert.equal(list.length, 1);
    assert.deepEqual(list[0], summary);

    const fetched = await history.get(summary.id);
    assert.ok(fetched !== null);
    assert.deepEqual(fetched.jobPosting, assessment.jobPosting);
    assert.equal(fetched.overallScore, assessment.overallScore);
    assert.deepEqual(fetched.matches, assessment.matches);
    assert.deepEqual(fetched.dimensions, assessment.dimensions);
    assert.equal(fetched.triageNote, assessment.triageNote);
  } finally {
    await rmDir(dir);
  }
});

test("save() three assessments, list() returns newest first", async () => {
  const dir = await tmpDir("ordering");
  try {
    const history = new FileMatchHistory(dir);
    const a = await history.save(makeAssessment("first body", "Role A"));
    // Force distinct timestamps; ISO strings include ms but ordering is not
    // guaranteed if saves happen within the same millisecond.
    await new Promise((r) => setTimeout(r, 5));
    const b = await history.save(makeAssessment("second body", "Role B"));
    await new Promise((r) => setTimeout(r, 5));
    const c = await history.save(makeAssessment("third body", "Role C"));

    const list = await history.list();
    assert.equal(list.length, 3);
    assert.deepEqual(
      list.map((s) => s.id),
      [c.id, b.id, a.id],
    );
  } finally {
    await rmDir(dir);
  }
});

test("get() with an unknown id returns null", async () => {
  const dir = await tmpDir("unknown");
  try {
    const history = new FileMatchHistory(dir);
    const result = await history.get("2025-01-01T00-00-00-000Z-deadbeef");
    assert.equal(result, null);
  } finally {
    await rmDir(dir);
  }
});

test("get() with a path-traversal id throws before touching the filesystem", async () => {
  const dir = await tmpDir("traversal");
  try {
    const history = new FileMatchHistory(dir);
    await assert.rejects(() => history.get("../etc/passwd"), /Invalid match id/);
    await assert.rejects(() => history.get("foo/bar"), /Invalid match id/);
    await assert.rejects(() => history.get(".."), /Invalid match id/);
    await assert.rejects(() => history.get("foo.json"), /Invalid match id/);
  } finally {
    await rmDir(dir);
  }
});

test("delete() existing file returns true; subsequent get() returns null", async () => {
  const dir = await tmpDir("delete");
  try {
    const history = new FileMatchHistory(dir);
    const summary = await history.save(makeAssessment("body to delete"));

    const deleted = await history.delete(summary.id);
    assert.equal(deleted, true);

    const fetched = await history.get(summary.id);
    assert.equal(fetched, null);
  } finally {
    await rmDir(dir);
  }
});

test("delete() nonexistent file returns false", async () => {
  const dir = await tmpDir("delete-missing");
  try {
    const history = new FileMatchHistory(dir);
    const deleted = await history.delete("2025-01-01T00-00-00-000Z-cafebabe");
    assert.equal(deleted, false);
  } finally {
    await rmDir(dir);
  }
});

test("delete() with an unsafe id throws before touching the filesystem", async () => {
  const dir = await tmpDir("delete-traversal");
  try {
    const history = new FileMatchHistory(dir);
    await assert.rejects(() => history.delete("../etc/passwd"), /Invalid match id/);
  } finally {
    await rmDir(dir);
  }
});

test("list() skips a corrupted JSON file and returns the others", async () => {
  const dir = await tmpDir("corrupt");
  try {
    const history = new FileMatchHistory(dir);
    const a = await history.save(makeAssessment("good one", "Good A"));
    await new Promise((r) => setTimeout(r, 5));
    const b = await history.save(makeAssessment("good two", "Good B"));

    // Drop a malformed file alongside the good ones.
    await fs.writeFile(
      path.join(dir, "2025-01-01T00-00-00-000Z-badf00d1.json"),
      "{ this is not valid json",
      "utf8",
    );

    const list = await history.list();
    assert.equal(list.length, 2);
    const ids = list.map((s) => s.id).sort();
    assert.deepEqual(ids, [a.id, b.id].sort());
  } finally {
    await rmDir(dir);
  }
});
