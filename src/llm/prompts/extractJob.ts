import type { JobInput, LLMContentBlock, LLMMessage } from "../../core/types.js";

export interface BuiltPrompt {
  system: string;
  messages: LLMMessage[];
}

const SYSTEM = `You extract a structured JobPosting from a job description.

Return ONLY a single JSON object. No prose, no markdown fences, no preamble,
no trailing commentary. The first character must be "{" and the last "}".

Schema:
{
  "title": string,
  "company": string | null,
  "location": string | null,
  "responsibilities": string[],
  "requirements": JobRequirement[],
  "toneAndCulture": string | null,
  "rawText": string
}

JobRequirement:
{
  "id": "req_001" | "req_002" | ...   // zero-padded, unique, sequential
  "text": string,                     // verbatim from the posting
  "dimension": "technical_skills" | "domain_knowledge" | "experience_level" | "role_fit",
  "hardness": "must_have" | "nice_to_have",
  "matchability": "tokenizable" | "soft" | "unmatchable",
  "skillTokens"?: string[],           // tokenizable only
  "yearsRequired"?: number | null     // tokenizable only; null if unspecified
}

Dimension rules:
- technical_skills: concrete tools, languages, frameworks, libraries, platforms.
- domain_knowledge: industry/business familiarity (fintech, healthcare, ads, …).
- experience_level: years, seniority, scope (e.g. "5+ years", "led a team").
- role_fit: soft skills, working style, communication, culture.

Hardness rules:
- must_have: signaled by "required", "must", "essential", "needed".
- nice_to_have: signaled by "nice to have", "preferred", "bonus", "plus".
- When unsure, default to must_have unless the posting clearly downgrades it.

Matchability rules:
- tokenizable: concrete skill OR a years-of-experience claim. Emit
  "skillTokens" AND "yearsRequired" (number or null).
- soft: requires narrative judgment about prior work or character (e.g.
  "comfortable owning ambiguous problems", "experience scaling teams").
  Do NOT emit skillTokens or yearsRequired.
- unmatchable: cannot be assessed from a profile (e.g. "must love dogs",
  "willing to travel 50%", "based in Berlin"). Excluded from scoring.

skillTokens normalization:
- lowercase, kebab-case ("typescript", "react", "data-engineering").
- Collapse aliases:
  "JS" / "Javascript" -> "javascript"
  "TS" / "Typescript" -> "typescript"
  "K8s"               -> "kubernetes"
  "Postgres" / "PostgreSQL" -> "postgresql"
  "Node" / "NodeJS"   -> "node"
- One canonical token per requirement when possible.
- If a requirement names two skills (e.g. "Python AND TypeScript"), SPLIT
  into two requirements with different ids.
- Drop product/version qualifiers ("React 18" -> "react").

responsibilities[] is the prose list of what the role does day-to-day.
It is distinct from requirements; do not duplicate items across both.

rawText:
- For text input, echo the input.
- For PDF/image, a faithful transcription of the visible job description.

Examples:

Tokenizable requirement:
{
  "id": "req_001",
  "text": "5+ years of TypeScript",
  "dimension": "technical_skills",
  "hardness": "must_have",
  "matchability": "tokenizable",
  "skillTokens": ["typescript"],
  "yearsRequired": 5
}

Soft requirement:
{
  "id": "req_007",
  "text": "comfortable driving ambiguous, cross-team initiatives",
  "dimension": "role_fit",
  "hardness": "must_have",
  "matchability": "soft"
}

Output JSON only.`;

export function buildExtractJobPrompt(input: JobInput): BuiltPrompt {
  const instruction = "Extract the JobPosting per the schema. JSON only.";

  let content: string | LLMContentBlock[];
  if (input.kind === "pdf") {
    content = [
      { type: "document", mediaType: "application/pdf", bytes: input.bytes },
      { type: "text", text: instruction },
    ];
  } else if (input.kind === "image") {
    content = [
      { type: "image", mediaType: input.mediaType, bytes: input.bytes },
      { type: "text", text: instruction },
    ];
  } else {
    content = [
      {
        type: "text",
        text: `${instruction}\n\n--- JOB POSTING ---\n${input.content}`,
      },
    ];
  }

  return {
    system: SYSTEM,
    messages: [{ role: "user", content }],
  };
}
