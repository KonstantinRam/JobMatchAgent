/**
 * Core type contract for the Job Match Agent.
 *
 * Architectural commitment:
 *   The LLM EXTRACTS structured data and PRESENTS results. The matching,
 *   scoring, and profile-mutation spines are deterministic code.
 *   The model never directly writes to state — it emits typed update ops
 *   that code validates and applies.
 *
 * RULE: Do not modify this file unless explicitly asked. If a downstream
 * implementation would require a type change, stop and raise the question.
 */

export type JobInput =
  | { kind: "pdf"; bytes: Buffer }
  | { kind: "image"; bytes: Buffer; mediaType: "image/png" | "image/jpeg" | "image/webp" }
  | { kind: "text"; content: string };

// ============================================================================
// PROFILE
// ============================================================================

export interface BackgroundProfile {
  name: string;
  headline: string;
  summary: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillGroup[];
  education: EducationEntry[];
}

export interface ExperienceEntry {
  role: string;
  company: string;
  startDate: string;       // YYYY-MM
  endDate: string | null;  // null = current
  highlights: string[];
}

export interface ProjectEntry {
  name: string;
  summary: string;
  techStack: string[];
  outcomes: string[];
}

export interface SkillGroup {
  category: string;
  skills: string[];
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  endDate: string;         // YYYY-MM
}

/**
 * Returns true if the profile has enough content to support a useful match
 * assessment. Used to gate the analyze flow on the frontend and to inform
 * the chat pipeline's "what's still missing" prompts.
 *
 * The exact rules live in src/core/profileCompleteness.ts so the chat
 * prompt and the UI agree on the threshold.
 */
export interface ProfileCompletenessReport {
  isReady: boolean;
  missingSections: ("identity" | "experience" | "skills")[];
  notes: string[];           // human-readable hints
}

// ============================================================================
// PROFILE UPDATE OPS — the LLM emits these; code validates and applies.
//
// Higher-level domain ops, not JSON Patch. Easier for the model to produce
// reliably and easier for code to validate.
// ============================================================================

export type ProfileUpdateOp =
  | { kind: "set_identity"; name?: string; headline?: string; summary?: string }
  | { kind: "add_experience"; entry: ExperienceEntry }
  | { kind: "edit_experience"; index: number; entry: Partial<ExperienceEntry> }
  | { kind: "remove_experience"; index: number }
  | { kind: "add_project"; entry: ProjectEntry }
  | { kind: "edit_project"; index: number; entry: Partial<ProjectEntry> }
  | { kind: "remove_project"; index: number }
  | { kind: "add_skills"; category: string; skills: string[] }
  | { kind: "remove_skills"; category: string; skills: string[] }
  | { kind: "add_education"; entry: EducationEntry }
  | { kind: "edit_education"; index: number; entry: Partial<EducationEntry> }
  | { kind: "remove_education"; index: number };

// ============================================================================
// JOB POSTING — produced by extractJob (LLM).
// ============================================================================

export type DimensionKey =
  | "technical_skills"
  | "domain_knowledge"
  | "experience_level"
  | "role_fit";

export type RequirementHardness = "must_have" | "nice_to_have";
export type RequirementMatchability = "tokenizable" | "soft" | "unmatchable";

export interface JobRequirement {
  id: string;
  text: string;
  dimension: DimensionKey;
  hardness: RequirementHardness;
  matchability: RequirementMatchability;
  skillTokens?: string[];
  yearsRequired?: number | null;
}

export interface JobPosting {
  title: string;
  company: string | null;
  location: string | null;
  responsibilities: string[];
  requirements: JobRequirement[];
  toneAndCulture: string | null;
  rawText: string;
}

// ============================================================================
// CLAIM SET — produced by normalizeProfile.
// ============================================================================

export interface SkillClaim {
  skillToken: string;
  years: number;
  evidenceRefs: string[];
}

export interface ExperienceTotals {
  totalYearsProfessional: number;
}

export interface NarrativeBullet {
  text: string;
  source: string;
}

export interface ClaimSet {
  skills: SkillClaim[];
  experienceTotals: ExperienceTotals;
  narrativeBullets: NarrativeBullet[];
}

// ============================================================================
// REQUIREMENT MATCH + DIMENSION RESULT.
// ============================================================================

export type MatchVerdict = "matched" | "unmatched" | "uncertain";
export type MatcherKind = "tokenizer" | "soft_llm" | "skipped";

export interface RequirementMatch {
  requirementId: string;
  verdict: MatchVerdict;
  matcher: MatcherKind;
  evidence: string[];
  reasoning?: string;
  llmConfidence?: number;
}

export interface DimensionResult {
  dimension: DimensionKey;
  totalMustHaves: number;
  matchedMustHaves: number;
  totalNiceToHaves: number;
  matchedNiceToHaves: number;
  uncertainCount: number;
  unmatchableCount: number;
  score: number | null;
}

// ============================================================================
// MATCH ASSESSMENT — final artifact.
// ============================================================================

export interface MatchAssessment {
  jobPosting: JobPosting;
  claimSet: ClaimSet;
  matches: RequirementMatch[];
  dimensions: DimensionResult[];
  overallScore: number;
  flaggedForReview: boolean;
  unscoredRequirements: JobRequirement[];
  triageNote: string;
}

// ============================================================================
// MATCH HISTORY — persisted past assessments.
// ============================================================================

export interface MatchSummary {
  id: string;             // timestamp + short hash, filesystem-safe
  createdAt: string;      // ISO datetime
  jobTitle: string;
  company: string | null;
  overallScore: number;
  flaggedForReview: boolean;
}

export interface IMatchHistory {
  list(): Promise<MatchSummary[]>;                       // newest first
  get(id: string): Promise<MatchAssessment | null>;
  save(assessment: MatchAssessment): Promise<MatchSummary>;
  delete(id: string): Promise<boolean>;                  // for UI affordance
}

// ============================================================================
// CHAT — Q&A + elicitation.
//
// Each turn produces an assistant message AND zero or more profile updates.
// The frontend appends the message to the local thread and refreshes its
// view of the profile; the server persists the updated profile.
// ============================================================================

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatThread {
  messages: ChatMessage[];
}

export interface ChatTurnResult {
  reply: ChatMessage;
  appliedOps: ProfileUpdateOp[];     // for UI ("Added: 3 years TypeScript")
  updatedProfile: BackgroundProfile; // post-application
}

// ============================================================================
// LLM PROVIDER — abstract interface. Implementation in src/llm/claude.ts.
// ============================================================================

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; bytes: Buffer }
  | { type: "document"; mediaType: "application/pdf"; bytes: Buffer };

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | LLMContentBlock[];
}

export interface LLMCallOptions {
  system?: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMProvider {
  complete(opts: LLMCallOptions): Promise<string>;
  completeJSON<T>(opts: LLMCallOptions): Promise<T>;
}

// ============================================================================
// PROFILE STORE — abstract interface. Now read + write.
// ============================================================================

export interface IProfileStore {
  load(): Promise<BackgroundProfile>;
  save(profile: BackgroundProfile): Promise<void>;
}

/** Default empty profile. Used when no profile.json exists yet. */
export const EMPTY_PROFILE: BackgroundProfile = {
  name: "",
  headline: "",
  summary: "",
  experience: [],
  projects: [],
  skills: [],
  education: [],
};
