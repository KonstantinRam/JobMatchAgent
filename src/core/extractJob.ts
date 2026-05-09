import { z } from "zod";
import { buildExtractJobPrompt } from "../llm/prompts/extractJob.js";
import type { JobInput, JobPosting, LLMProvider } from "./types.js";

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const dimensionSchema = z.enum([
  "technical_skills",
  "domain_knowledge",
  "experience_level",
  "role_fit",
]);

const hardnessSchema = z.enum(["must_have", "nice_to_have"]);

const baseFields = {
  id: z.string().min(1),
  text: z.string().min(1),
  dimension: dimensionSchema,
  hardness: hardnessSchema,
};

const tokenizableRequirementSchema = z.object({
  ...baseFields,
  matchability: z.literal("tokenizable"),
  skillTokens: z.array(z.string().regex(KEBAB_CASE)).min(1),
  yearsRequired: z.union([z.number().min(0), z.null()]),
});

const softRequirementSchema = z.object({
  ...baseFields,
  matchability: z.literal("soft"),
  skillTokens: z.array(z.string()).max(0).optional(),
  yearsRequired: z.null().optional(),
});

const unmatchableRequirementSchema = z.object({
  ...baseFields,
  matchability: z.literal("unmatchable"),
  skillTokens: z.array(z.string()).max(0).optional(),
  yearsRequired: z.null().optional(),
});

const requirementSchema = z.discriminatedUnion("matchability", [
  tokenizableRequirementSchema,
  softRequirementSchema,
  unmatchableRequirementSchema,
]);

export const JobPostingSchema = z
  .object({
    title: z.string(),
    company: z.string().nullable(),
    location: z.string().nullable(),
    responsibilities: z.array(z.string()),
    requirements: z.array(requirementSchema).min(1),
    toneAndCulture: z.string().nullable(),
    rawText: z.string(),
  })
  .superRefine((posting, ctx) => {
    const seen = new Set<string>();
    posting.requirements.forEach((req, index) => {
      if (seen.has(req.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["requirements", index, "id"],
          message: `Duplicate requirement id: ${req.id}`,
        });
      }
      seen.add(req.id);
    });
  });

/**
 * Stage 1 of the analyze pipeline.
 *
 * Takes a raw JobInput (PDF bytes, image bytes, or plain text) and produces
 * a structured JobPosting. The intermediate is inspectable and reusable —
 * the matcher takes the JobPosting, not the original bytes.
 *
 * The LLM's job here is EXTRACTION + CATEGORIZATION + NORMALIZATION:
 *   - Extract responsibilities, requirements, tone.
 *   - For each requirement, decide its dimension and hardness.
 *   - For each requirement, decide its matchability:
 *       "tokenizable" → emit canonical skillTokens + yearsRequired (or null)
 *       "soft"        → leave skillTokens / yearsRequired empty
 *       "unmatchable" → leave them empty; this requirement is surfaced for
 *                       human review and excluded from scoring
 *   - Assign a stable id per requirement (req_001, req_002, …).
 *
 * The LLM does NOT score, judge, or weight anything here.
 *
 * Pure function of (llm, input) → JobPosting.
 */
export async function extractJob(
  llm: LLMProvider,
  input: JobInput,
): Promise<JobPosting> {
  const { system, messages } = buildExtractJobPrompt(input);
  const raw = await llm.completeJSON<unknown>({
    system,
    messages,
    temperature: 0.2,
  });

  const result = JobPostingSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`extractJob: invalid JobPosting from LLM: ${issues}`);
  }

  const posting = result.data as JobPosting;
  if (input.kind === "text") {
    posting.rawText = input.content;
  }
  return posting;
}
