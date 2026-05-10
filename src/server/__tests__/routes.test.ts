import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "../index.js";
import { FileMatchHistory } from "../../core/matchHistory.js";
import { EMPTY_PROFILE } from "../../core/types.js";
import { FakeLLMProvider } from "../../core/__tests__/_fakeLlm.js";
import type {
  BackgroundProfile,
  IProfileStore,
  JobPosting,
  LLMCallOptions,
  MatchAssessment,
} from "../../core/types.js";

class StubProfileStore implements IProfileStore {
  constructor(public profile: BackgroundProfile = { ...EMPTY_PROFILE }) {}
  async load(): Promise<BackgroundProfile> {
    // Return a deep clone to avoid leaking mutations.
    return JSON.parse(JSON.stringify(this.profile));
  }
  async save(profile: BackgroundProfile): Promise<void> {
    this.profile = JSON.parse(JSON.stringify(profile));
  }
}

async function tmpMatchesDir(suffix: string): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `routes-test-${process.pid}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}-${suffix}`,
  );
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function rmDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

interface Harness {
  baseUrl: string;
  llm: FakeLLMProvider;
  profileStore: StubProfileStore;
  matchHistory: FileMatchHistory;
  matchesDir: string;
  close: () => Promise<void>;
}

async function startServer(opts: {
  llmResponse: unknown | ((opts: LLMCallOptions) => unknown);
  initialProfile?: BackgroundProfile;
  matchesDirSuffix: string;
}): Promise<Harness> {
  const llm = new FakeLLMProvider(opts.llmResponse);
  const profileStore = new StubProfileStore(
    opts.initialProfile ?? { ...EMPTY_PROFILE },
  );
  const matchesDir = await tmpMatchesDir(opts.matchesDirSuffix);
  const matchHistory = new FileMatchHistory(matchesDir);
  const app = createServer({ llm, profileStore, matchHistory });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    llm,
    profileStore,
    matchHistory,
    matchesDir,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await rmDir(matchesDir);
    },
  };
}

const READY_PROFILE: BackgroundProfile = {
  name: "Alex",
  headline: "Senior TypeScript engineer",
  summary: "Engineer with broad ownership of backend systems.",
  experience: [
    {
      role: "Senior Engineer",
      company: "Acme",
      startDate: "2020-01",
      endDate: null,
      highlights: ["Owned migration end-to-end."],
    },
  ],
  projects: [],
  skills: [{ category: "languages", skills: ["TypeScript"] }],
  education: [],
};

const VALID_JOB_POSTING: JobPosting = {
  title: "Senior Engineer",
  company: "Acme",
  location: "Remote",
  responsibilities: ["Build features"],
  requirements: [
    {
      id: "req_001",
      text: "TypeScript",
      dimension: "technical_skills",
      hardness: "must_have",
      matchability: "tokenizable",
      skillTokens: ["typescript"],
      yearsRequired: 3,
    },
    {
      id: "req_002",
      text: "Comfortable with ambiguity",
      dimension: "role_fit",
      hardness: "must_have",
      matchability: "soft",
    },
  ],
  toneAndCulture: null,
  rawText: "raw posting",
};

function analyzeDispatcher(opts: LLMCallOptions): unknown {
  const sys = opts.system ?? "";
  if (sys.startsWith("You write a short note for a job seeker")) {
    return "Triage note.";
  }
  if (sys.startsWith("You assess ONE soft job requirement")) {
    return {
      verdict: "matched",
      evidence: ["experience[0].highlights[0]"],
      reasoning: "Bullet attests to ownership.",
      confidence: 0.85,
    };
  }
  if (sys.startsWith("You extract a structured JobPosting")) {
    return VALID_JOB_POSTING;
  }
  throw new Error(`unexpected LLM call with system: ${sys.slice(0, 80)}`);
}

// ---------------------------------------------------------------------------

test("GET /api/health → 200 { ok: true }", async () => {
  const h = await startServer({ llmResponse: {}, matchesDirSuffix: "health" });
  try {
    const res = await fetch(`${h.baseUrl}/api/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  } finally {
    await h.close();
  }
});

test("GET /api/profile → empty profile + completeness", async () => {
  const h = await startServer({ llmResponse: {}, matchesDirSuffix: "prof-get" });
  try {
    const res = await fetch(`${h.baseUrl}/api/profile`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      profile: BackgroundProfile;
      completeness: { isReady: boolean; missingSections: string[] };
    };
    assert.deepEqual(body.profile, EMPTY_PROFILE);
    assert.equal(body.completeness.isReady, false);
    assert.deepEqual(
      body.completeness.missingSections.sort(),
      ["experience", "identity", "skills"],
    );
  } finally {
    await h.close();
  }
});

test("POST /api/profile/reset → empty profile; subsequent GET returns empty", async () => {
  const h = await startServer({
    llmResponse: {},
    initialProfile: READY_PROFILE,
    matchesDirSuffix: "prof-reset",
  });
  try {
    const res = await fetch(`${h.baseUrl}/api/profile/reset`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { profile: BackgroundProfile };
    assert.deepEqual(body.profile, EMPTY_PROFILE);

    const after = await fetch(`${h.baseUrl}/api/profile`);
    const afterBody = (await after.json()) as { profile: BackgroundProfile };
    assert.deepEqual(afterBody.profile, EMPTY_PROFILE);
  } finally {
    await h.close();
  }
});

test("POST /api/chat with empty message → 400", async () => {
  const h = await startServer({ llmResponse: {}, matchesDirSuffix: "chat-400" });
  try {
    const res = await fetch(`${h.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ thread: { messages: [] }, message: "" }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.ok(typeof body.error === "string");
  } finally {
    await h.close();
  }
});

test("POST /api/chat happy path applies set_identity", async () => {
  const h = await startServer({
    llmResponse: {
      updates: [
        { kind: "set_identity", name: "Joe", headline: "Engineer" },
      ],
      reply: "Got it.",
    },
    matchesDirSuffix: "chat-ok",
  });
  try {
    const res = await fetch(`${h.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        thread: { messages: [] },
        message: "My name is Joe; I'm an engineer.",
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      reply: { role: string; content: string };
      appliedOps: { kind: string }[];
      updatedProfile: BackgroundProfile;
    };
    assert.equal(body.updatedProfile.name, "Joe");
    assert.equal(body.updatedProfile.headline, "Engineer");
    assert.equal(body.reply.content, "Got it.");
    assert.equal(body.appliedOps[0].kind, "set_identity");
  } finally {
    await h.close();
  }
});

test("POST /api/analyze with no file and no text → 400", async () => {
  const h = await startServer({
    llmResponse: {},
    initialProfile: READY_PROFILE,
    matchesDirSuffix: "analyze-empty",
  });
  try {
    const res = await fetch(`${h.baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /file or a text body/);
  } finally {
    await h.close();
  }
});

test("POST /api/analyze with text but empty profile → 400 Profile incomplete", async () => {
  const h = await startServer({
    llmResponse: {},
    matchesDirSuffix: "analyze-incomplete",
  });
  try {
    const res = await fetch(`${h.baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Some job description text." }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as {
      error: string;
      missingSections?: string[];
    };
    assert.equal(body.error, "Profile incomplete");
    assert.ok(Array.isArray(body.missingSections));
    assert.ok((body.missingSections ?? []).length > 0);
  } finally {
    await h.close();
  }
});

test("POST /api/analyze happy path persists assessment retrievable via /api/matches/:id", async () => {
  const h = await startServer({
    llmResponse: analyzeDispatcher,
    initialProfile: READY_PROFILE,
    matchesDirSuffix: "analyze-ok",
  });
  try {
    const res = await fetch(`${h.baseUrl}/api/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "We are hiring a senior TS engineer." }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      assessment: MatchAssessment;
      summary: { id: string; jobTitle: string };
    };
    assert.equal(body.assessment.jobPosting.title, "Senior Engineer");
    assert.equal(body.assessment.triageNote, "Triage note.");
    assert.equal(body.summary.jobTitle, "Senior Engineer");
    assert.match(body.summary.id, /^[A-Za-z0-9-]+$/);

    const fetched = await fetch(
      `${h.baseUrl}/api/matches/${body.summary.id}`,
    );
    assert.equal(fetched.status, 200);
    const fetchedBody = (await fetched.json()) as {
      assessment: MatchAssessment;
    };
    assert.equal(
      fetchedBody.assessment.jobPosting.title,
      body.assessment.jobPosting.title,
    );
    assert.equal(fetchedBody.assessment.triageNote, body.assessment.triageNote);
  } finally {
    await h.close();
  }
});

test("GET /api/matches with empty history → empty list", async () => {
  const h = await startServer({
    llmResponse: {},
    matchesDirSuffix: "matches-empty",
  });
  try {
    const res = await fetch(`${h.baseUrl}/api/matches`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { matches: unknown[] };
    assert.deepEqual(body.matches, []);
  } finally {
    await h.close();
  }
});

test("GET /api/matches/unknown-id → 404", async () => {
  const h = await startServer({
    llmResponse: {},
    matchesDirSuffix: "matches-404",
  });
  try {
    const res = await fetch(
      `${h.baseUrl}/api/matches/2025-01-01T00-00-00-000Z-deadbeef`,
    );
    assert.equal(res.status, 404);
  } finally {
    await h.close();
  }
});

test("GET /api/matches/<unsafe id> → 400 (id validation)", async () => {
  const h = await startServer({
    llmResponse: {},
    matchesDirSuffix: "matches-traversal",
  });
  try {
    // A literal "../etc" path is normalized by URL parsers, so we send
    // an unsafe but routable id (contains a dot) to exercise the 400 path.
    const res = await fetch(`${h.baseUrl}/api/matches/foo.bar`);
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /Invalid id/);
  } finally {
    await h.close();
  }
});
