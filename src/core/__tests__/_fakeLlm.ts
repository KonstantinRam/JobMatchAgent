import type { LLMCallOptions, LLMProvider } from "../types.js";

/**
 * Test double for LLMProvider. Accepts either a fixed response or a function
 * that derives the response from the call options (useful when one test needs
 * to dispatch different responses to different prompts in a single LLM
 * provider, e.g. soft match + triage note in the assessMatch orchestrator).
 *
 * `complete` returns the response as-is when it is already a string;
 * otherwise it JSON.stringify's. `completeJSON` casts the response to T.
 */
export class FakeLLMProvider implements LLMProvider {
  public callCount = 0;
  constructor(
    private response: unknown | ((opts: LLMCallOptions) => unknown),
  ) {}
  async complete(opts: LLMCallOptions): Promise<string> {
    this.callCount++;
    const r = this.resolve(opts);
    return typeof r === "string" ? r : JSON.stringify(r);
  }
  async completeJSON<T>(opts: LLMCallOptions): Promise<T> {
    this.callCount++;
    return this.resolve(opts) as T;
  }
  private resolve(opts: LLMCallOptions): unknown {
    return typeof this.response === "function"
      ? (this.response as (opts: LLMCallOptions) => unknown)(opts)
      : this.response;
  }
}

export class ThrowingLLMProvider implements LLMProvider {
  constructor(private message: string) {}
  async complete(_opts: LLMCallOptions): Promise<string> {
    throw new Error(this.message);
  }
  async completeJSON<T>(_opts: LLMCallOptions): Promise<T> {
    throw new Error(this.message);
  }
}
