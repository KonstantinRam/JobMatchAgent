import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMCallOptions,
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
} from "../core/types.js";


/**
 * ClaudeProvider — concrete LLMProvider backed by the Anthropic SDK.
 *
 * Translation rules (LLMMessage -> Anthropic SDK message):
 *   - LLMMessage with content as string -> single { type: "text", text } block
 *   - LLMContentBlock "text"     -> { type: "text", text }
 *   - LLMContentBlock "image"    -> { type: "image", source: base64 + media_type }
 *   - LLMContentBlock "document" -> { type: "document", source: base64 application/pdf }
 *
 * Buffers are base64-encoded before being passed to the SDK.
 */
export class ClaudeProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly defaultMaxTokens: number;

  constructor(opts: {
    apiKey: string;
    model?: string;
    defaultMaxTokens?: number;
  }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? "claude-opus-4-7";
    this.defaultMaxTokens = opts.defaultMaxTokens ?? 4096;
  }

  /**
   * Indirection for testability: tests subclass and override this to return
   * a fake response instead of calling the real SDK.
   */
  protected createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
  ): Promise<Anthropic.Message> {
    return this.client.messages.create(params);
  }

  async complete(opts: LLMCallOptions): Promise<string> {
    const messages = opts.messages.map(translateMessage);

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: opts.maxTokens ?? this.defaultMaxTokens,
      messages,
    };
    if (opts.system !== undefined) params.system = opts.system;
    //TODO: temperature
    // temperature intentionally not forwarded: deprecated for claude-opus-4-7.
    // Callers may still pass it via LLMCallOptions; the value is dropped here.

    const response = await this.createMessage(params);

    const textParts: string[] = [];
    for (const block of response.content) {
      if (block.type === "text") textParts.push(block.text);
    }
    if (textParts.length === 0) {
      throw new Error(
        "ClaudeProvider.complete: response contained no text blocks",
      );
    }
    return textParts.join("");
  }

  async completeJSON<T>(opts: LLMCallOptions): Promise<T> {
    const raw = await this.complete(opts);
    const stripped = stripCodeFences(raw);
    try {
      return JSON.parse(stripped) as T;
    } catch {
      const preview = previewForError(raw);
      throw new Error(
        `ClaudeProvider.completeJSON: failed to parse JSON. Preview: ${preview}`,
      );
    }
  }
}

function translateMessage(msg: LLMMessage): Anthropic.MessageParam {
  if (typeof msg.content === "string") {
    return {
      role: msg.role,
      content: [{ type: "text", text: msg.content }],
    };
  }
  return {
    role: msg.role,
    content: msg.content.map(translateBlock),
  };
}

function translateBlock(block: LLMContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "image":
      return {
        type: "image",
        source: {
          type: "base64",
          media_type:
            block.mediaType as Anthropic.Base64ImageSource["media_type"],
          data: block.bytes.toString("base64"),
        },
      };
    case "document":
      return {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: block.bytes.toString("base64"),
        },
      };
  }
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  return match ? match[1].trim() : trimmed;
}

function previewForError(raw: string): string {
  const limit = 300;
  return raw.length > limit ? raw.slice(0, limit) + "…" : raw;
}
