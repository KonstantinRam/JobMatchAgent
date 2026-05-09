import { test } from "node:test";
import assert from "node:assert/strict";
import { chatTurn } from "../chat.js";
import { FakeLLMProvider } from "./_fakeLlm.js";
import { EMPTY_PROFILE } from "../types.js";
import type {
  BackgroundProfile,
  ChatThread,
  IProfileStore,
} from "../types.js";

class StubProfileStore implements IProfileStore {
  public saveCount = 0;
  constructor(public profile: BackgroundProfile = EMPTY_PROFILE) {}
  async load(): Promise<BackgroundProfile> {
    return this.profile;
  }
  async save(p: BackgroundProfile): Promise<void> {
    this.saveCount++;
    this.profile = p;
  }
}

const emptyThread = (): ChatThread => ({ messages: [] });

const validAddExperience = {
  kind: "add_experience" as const,
  entry: {
    role: "Senior Engineer",
    company: "Acme",
    startDate: "2020-01",
    endDate: null,
    highlights: ["Led platform migration"],
  },
};

test("chatTurn: happy path applies add_experience and returns assistant reply", async () => {
  const store = new StubProfileStore();
  const llm = new FakeLLMProvider({
    updates: [validAddExperience],
    reply: "Added.",
  });

  const result = await chatTurn(llm, store, emptyThread(), "I worked at Acme");

  assert.equal(result.reply.role, "assistant");
  assert.equal(result.reply.content, "Added.");
  assert.equal(result.appliedOps.length, 1);
  assert.equal(result.updatedProfile.experience.length, 1);
  assert.equal(result.updatedProfile.experience[0].company, "Acme");
  // Stub captured the new profile.
  assert.equal(store.profile.experience.length, 1);
  assert.equal(store.saveCount, 1);
});

test("chatTurn: empty updates still saves and returns the reply", async () => {
  const store = new StubProfileStore();
  const llm = new FakeLLMProvider({
    updates: [],
    reply: "Got it.",
  });

  const result = await chatTurn(llm, store, emptyThread(), "ok thanks");

  assert.equal(result.reply.content, "Got it.");
  assert.deepEqual(result.appliedOps, []);
  // Profile unchanged in content but save was still called.
  assert.deepEqual(result.updatedProfile, EMPTY_PROFILE);
  assert.equal(store.saveCount, 1);
  assert.deepEqual(store.profile, EMPTY_PROFILE);
});

test("chatTurn: malformed response (missing reply) throws naming the field", async () => {
  const store = new StubProfileStore();
  const llm = new FakeLLMProvider({ updates: [] });

  await assert.rejects(
    () => chatTurn(llm, store, emptyThread(), "hi"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /reply/);
      return true;
    },
  );
  assert.equal(store.saveCount, 0);
});

test("chatTurn: unknown op kind throws", async () => {
  const store = new StubProfileStore();
  const llm = new FakeLLMProvider({
    updates: [{ kind: "frob_widget", value: 1 }],
    reply: "ok",
  });

  await assert.rejects(
    () => chatTurn(llm, store, emptyThread(), "x"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /chatTurn: invalid LLM response/);
      return true;
    },
  );
  assert.equal(store.saveCount, 0);
});

test("chatTurn: out-of-range edit_experience surfaces op-index info from applyProfileUpdates", async () => {
  const store = new StubProfileStore();
  const llm = new FakeLLMProvider({
    updates: [
      {
        kind: "edit_experience",
        index: 5,
        entry: { role: "Staff Engineer" },
      },
    ],
    reply: "Updated.",
  });

  await assert.rejects(
    () => chatTurn(llm, store, emptyThread(), "promote me"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      // applyProfileUpdates wraps with "Op #0 (edit_experience): ..."
      assert.match(err.message, /Op #0 \(edit_experience\)/);
      assert.match(err.message, /index 5/);
      return true;
    },
  );
  assert.equal(store.saveCount, 0);
});

test("chatTurn: does not mutate the input thread", async () => {
  const store = new StubProfileStore();
  const llm = new FakeLLMProvider({
    updates: [validAddExperience],
    reply: "Added.",
  });

  const thread: ChatThread = {
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi — what should we add?" },
    ],
  };
  const before = thread.messages.length;
  const snapshot = JSON.parse(JSON.stringify(thread));

  await chatTurn(llm, store, thread, "I worked at Acme");

  assert.equal(thread.messages.length, before);
  assert.deepEqual(thread, snapshot);
});
