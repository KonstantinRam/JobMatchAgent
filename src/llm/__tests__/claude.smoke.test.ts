import { test } from "node:test";
import assert from "node:assert/strict";
import { ClaudeProvider } from "../claude.js";

const apiKey = process.env.ANTHROPIC_API_KEY;

test(
  "smoke: live API call returns non-empty text",
  { skip: apiKey ? false : "ANTHROPIC_API_KEY not set" },
  async () => {
    const provider = new ClaudeProvider({ apiKey: apiKey! });
    const out = await provider.complete({
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      maxTokens: 16,
    });
    assert.ok(typeof out === "string");
    assert.ok(out.trim().length > 0, "expected non-empty response");
  },
);
