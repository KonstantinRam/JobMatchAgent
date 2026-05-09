import { z } from "zod";
import { buildExtractJobPrompt } from "../llm/prompts/extractJob.js";
import type { JobInput, JobPosting, LLMProvider } from "./types.js";
import {normalizeSkillToken} from "./skillNormalization.js";

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
//TODO: To be sure we send LLM canonical forms via prompt.
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

  // cleaning up after the LLM,
  for (const req of posting.requirements) {
    if (req.skillTokens) {
      req.skillTokens = [...new Set(req.skillTokens.map(normalizeSkillToken))];
    }
  }

  return posting;
}
