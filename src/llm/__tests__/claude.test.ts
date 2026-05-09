import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { ClaudeProvider } from "../claude.js";
import type { LLMCallOptions } from "../../core/types.js";

/**
 * Test harness: subclass ClaudeProvider and override the protected
 * createMessage hook so we can inspect the translated SDK params and
 * return canned responses without making a real API call.
 */
class TestProvider extends ClaudeProvider {
  public lastParams: Anthropic.MessageCreateParamsNonStreaming | null = null;
  public response: Anthropic.Message;

  constructor(response: Anthropic.Message) {
    super({ apiKey: "test-key" });
    this.response = response;
  }

  protected override async createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    this.lastParams = params;
    return this.response;
  }
}

function textResponse(text: string): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-7",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
  } as unknown as Anthropic.Message;
}

test("string content is wrapped in a single text block", async () => {
  const p = new TestProvider(textResponse("hi"));
  await p.complete({
    messages: [{ role: "user", content: "hello world" }],
  });

  const params = p.lastParams!;
  assert.equal(params.messages.length, 1);
  const msg = params.messages[0];
  assert.equal(msg.role, "user");
  assert.deepEqual(msg.content, [{ type: "text", text: "hello world" }]);
});

test("mixed text + image blocks translate with base64-encoded data", async () => {
  const p = new TestProvider(textResponse("ok"));
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
  await p.complete({
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          { type: "image", mediaType: "image/png", bytes },
        ],
      },
    ],
  });

  const content = p.lastParams!.messages[0].content;
  assert.ok(Array.isArray(content));
  assert.equal(content.length, 2);
  assert.deepEqual(content[0], { type: "text", text: "describe this" });
  assert.deepEqual(content[1], {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: bytes.toString("base64"),
    },
  });
});

test("document block becomes a document content block with application/pdf", async () => {
  const p = new TestProvider(textResponse("ok"));
  const bytes = Buffer.from("%PDF-1.4 fake pdf body");
  await p.complete({
    messages: [
      {
        role: "user",
        content: [
          { type: "document", mediaType: "application/pdf", bytes },
        ],
      },
    ],
  });

  const content = p.lastParams!.messages[0].content;
  assert.ok(Array.isArray(content));
  assert.equal(content.length, 1);
  assert.deepEqual(content[0], {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: bytes.toString("base64"),
    },
  });
});

test("system and max_tokens are forwarded; temperature is dropped", async () => {
  const p = new TestProvider(textResponse("ok"));
  const opts: LLMCallOptions = {
    system: "you are concise",
    messages: [{ role: "user", content: "hi" }],
    maxTokens: 256,
    temperature: 0.2,
  };
  await p.complete(opts);

  const params = p.lastParams!;
  assert.equal(params.system, "you are concise");
  assert.equal(params.max_tokens, 256);
  assert.equal(params.temperature, undefined);
});

test("complete concatenates multiple text blocks from the response", async () => {
  const resp = {
    ...textResponse(""),
    content: [
      { type: "text", text: "first ", citations: null },
      { type: "text", text: "second", citations: null },
    ],
  } as unknown as Anthropic.Message;
  const p = new TestProvider(resp);
  const out = await p.complete({
    messages: [{ role: "user", content: "x" }],
  });
  assert.equal(out, "first second");
});

test("complete throws when the response has no text blocks", async () => {
  const resp = {
    ...textResponse(""),
    content: [],
  } as unknown as Anthropic.Message;
  const p = new TestProvider(resp);
  await assert.rejects(
    () => p.complete({ messages: [{ role: "user", content: "x" }] }),
    /no text blocks/,
  );
});

test("completeJSON strips ```json fences before parsing", async () => {
  const fenced = '```json\n{"foo": 1, "bar": "baz"}\n```';
  const p = new TestProvider(textResponse(fenced));
  const parsed = await p.completeJSON<{ foo: number; bar: string }>({
    messages: [{ role: "user", content: "x" }],
  });
  assert.deepEqual(parsed, { foo: 1, bar: "baz" });
});

test("completeJSON strips bare ``` fences before parsing", async () => {
  const fenced = "```\n[1, 2, 3]\n```";
  const p = new TestProvider(textResponse(fenced));
  const parsed = await p.completeJSON<number[]>({
    messages: [{ role: "user", content: "x" }],
  });
  assert.deepEqual(parsed, [1, 2, 3]);
});

test("completeJSON parses unfenced JSON with surrounding whitespace", async () => {
  const p = new TestProvider(textResponse('   {"ok": true}   '));
  const parsed = await p.completeJSON<{ ok: boolean }>({
    messages: [{ role: "user", content: "x" }],
  });
  assert.deepEqual(parsed, { ok: true });
});

test("completeJSON throws with a truncated preview on invalid JSON", async () => {
  const garbage = "this is not json " + "x".repeat(500);
  const p = new TestProvider(textResponse(garbage));
  await assert.rejects(
    () =>
      p.completeJSON({ messages: [{ role: "user", content: "x" }] }),
    (err: Error) => {
      assert.match(err.message, /failed to parse JSON/i);
      assert.match(err.message, /Preview:/);
      // The preview must be truncated — the full 500-char garbage tail must
      // not appear verbatim in the error.
      assert.ok(
        !err.message.includes("x".repeat(500)),
        "preview should be truncated, not contain the full raw response",
      );
      return true;
    },
  );
});
