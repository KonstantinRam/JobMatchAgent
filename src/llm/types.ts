/**
 * Re-export LLM-facing types from core for convenience inside src/llm/.
 *
 * The actual interface lives in src/core/types.ts (the contract). This file
 * exists so prompt builders and provider impls can import from a sibling
 * without reaching into core/ for non-domain types.
 */
export type {
  LLMCallOptions,
  LLMContentBlock,
  LLMMessage,
  LLMProvider,
} from "../core/types.js";
