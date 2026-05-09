import "dotenv/config";
import * as path from "node:path";
import { ClaudeProvider } from "../llm/claude.js";
import { JsonProfileStore } from "../core/profile.js";
import { FileMatchHistory } from "../core/matchHistory.js";
import type {
  IMatchHistory,
  IProfileStore,
  LLMProvider,
} from "../core/types.js";

export interface ServerDeps {
  llm: LLMProvider;
  profileStore: IProfileStore;
  matchHistory: IMatchHistory;
}

/**
 * Composition root. Reads env, constructs concrete impls, returns the deps
 * bag for createServer.
 *
 * Throws at call time (not module load) if ANTHROPIC_API_KEY is missing —
 * that way importing this file from tests doesn't fail unconditionally.
 */
export function buildDeps(): ServerDeps {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
  const model = process.env.CLAUDE_MODEL || undefined;
  const profilePath = path.resolve(
    process.cwd(),
    process.env.PROFILE_PATH || "data/profile.json",
  );
  const matchesDir = path.resolve(
    process.cwd(),
    process.env.MATCHES_DIR || "data/matches",
  );

  return {
    llm: new ClaudeProvider({ apiKey, model }),
    profileStore: new JsonProfileStore(profilePath),
    matchHistory: new FileMatchHistory(matchesDir),
  };
}
