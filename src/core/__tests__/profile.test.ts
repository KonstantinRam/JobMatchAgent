import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { JsonProfileStore } from "../profile.js";
import { EMPTY_PROFILE } from "../types.js";
import type { BackgroundProfile } from "../types.js";

function tmpFile(suffix: string): string {
  return path.join(
    os.tmpdir(),
    `profile-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}-${suffix}.json`,
  );
}

async function rmIfExists(p: string): Promise<void> {
  await fs.unlink(p).catch(() => {});
  await fs.unlink(p + ".tmp").catch(() => {});
}

const FULL_PROFILE: BackgroundProfile = {
  name: "Ada Lovelace",
  headline: "Analytical engine programmer",
  summary: "Pioneer of general-purpose computation.",
  experience: [
    {
      role: "Mathematician",
      company: "Analytical Society",
      startDate: "1840-01",
      endDate: null,
      highlights: ["First algorithm intended for a machine"],
    },
    {
      role: "Tutor",
      company: "Self",
      startDate: "1835-06",
      endDate: "1839-12",
      highlights: ["Taught calculus", "Wrote correspondence with Babbage"],
    },
  ],
  projects: [
    {
      name: "Notes on the Analytical Engine",
      summary: "Translation and notes",
      techStack: ["paper", "ink"],
      outcomes: ["Published Note G", "Influenced computing"],
    },
  ],
  skills: [
    { category: "math", skills: ["calculus", "algebra"] },
    { category: "languages", skills: ["French"] },
  ],
  education: [
    {
      institution: "Private tutoring",
      degree: "n/a",
      field: "Mathematics",
      endDate: "1835-06",
    },
  ],
};

test("load() returns EMPTY_PROFILE when the file does not exist", async () => {
  const p = tmpFile("missing");
  try {
    const store = new JsonProfileStore(p);
    const profile = await store.load();
    assert.deepEqual(profile, EMPTY_PROFILE);
  } finally {
    await rmIfExists(p);
  }
});

test("save() then load() round-trips a full profile", async () => {
  const p = tmpFile("roundtrip");
  try {
    const store = new JsonProfileStore(p);
    await store.save(FULL_PROFILE);
    const loaded = await store.load();
    assert.deepEqual(loaded, FULL_PROFILE);
  } finally {
    await rmIfExists(p);
  }
});

test("save() validates and refuses to write an invalid profile", async () => {
  const p = tmpFile("invalid");
  try {
    const store = new JsonProfileStore(p);
    const bogus = {
      // missing `name`
      headline: "x",
      summary: "x",
      experience: [],
      projects: [],
      skills: [],
      education: [],
    } as unknown as BackgroundProfile;

    await assert.rejects(() => store.save(bogus));

    // File must NOT have been created.
    await assert.rejects(
      () => fs.stat(p),
      (err: NodeJS.ErrnoException) => err.code === "ENOENT",
    );
    await assert.rejects(
      () => fs.stat(p + ".tmp"),
      (err: NodeJS.ErrnoException) => err.code === "ENOENT",
    );
  } finally {
    await rmIfExists(p);
  }
});

test("save() cleans up the .tmp file when rename fails", async () => {
  // Force fs.rename to fail by making the destination a non-empty directory.
  // On Linux/macOS, rename(file, non-empty-dir) fails with EISDIR / ENOTEMPTY.
  const p = tmpFile("atomic");
  try {
    await fs.mkdir(p, { recursive: true });
    await fs.writeFile(path.join(p, "blocker"), "x", "utf8");

    const store = new JsonProfileStore(p);
    await assert.rejects(() => store.save(FULL_PROFILE));

    // .tmp must have been unlinked; the directory at p must remain untouched.
    await assert.rejects(
      () => fs.stat(p + ".tmp"),
      (err: NodeJS.ErrnoException) => err.code === "ENOENT",
    );
    const stat = await fs.stat(p);
    assert.equal(stat.isDirectory(), true);
  } finally {
    await fs.rm(p, { recursive: true, force: true });
    await fs.unlink(p + ".tmp").catch(() => {});
  }
});

test("load() throws with the path when the file is malformed JSON", async () => {
  const p = tmpFile("malformed");
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, "{ this is not json", "utf8");
    const store = new JsonProfileStore(p);
    await assert.rejects(
      () => store.load(),
      (err: Error) => err.message.includes(p),
    );
  } finally {
    await rmIfExists(p);
  }
});

test("load() throws with the field path when JSON fails schema", async () => {
  const p = tmpFile("schema");
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    // `experience[0].highlights` is required to be string[]; here it's a number.
    const bad = {
      name: "x",
      headline: "x",
      summary: "x",
      experience: [
        {
          role: "r",
          company: "c",
          startDate: "2020-01",
          endDate: null,
          highlights: 42,
        },
      ],
      projects: [],
      skills: [],
      education: [],
    };
    await fs.writeFile(p, JSON.stringify(bad), "utf8");
    const store = new JsonProfileStore(p);
    await assert.rejects(
      () => store.load(),
      (err: Error) =>
        err.message.includes(p) && err.message.includes("highlights"),
    );
  } finally {
    await rmIfExists(p);
  }
});
