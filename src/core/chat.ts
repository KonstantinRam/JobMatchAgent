import { z } from "zod";
import { applyProfileUpdates } from "./applyProfileUpdates.js";
import { reportCompleteness } from "./profileCompleteness.js";
import { buildChatPrompt } from "../llm/prompts/chat.js";
import type {
  ChatThread,
  ChatTurnResult,
  IProfileStore,
  LLMProvider,
  ProfileUpdateOp,
} from "./types.js";

// ---------------------------------------------------------------------------
// Inline runtime schemas. They mirror the static types in types.ts but live
// here, with the code that uses them — runtime schemas are intentionally not
// exported from types.ts.
// ---------------------------------------------------------------------------

const ExperienceEntrySchema = z.object({
  role: z.string(),
  company: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  highlights: z.array(z.string()),
});

// .strict() prevents unknown keys from leaking through Partial<> shapes.
const ExperienceEntryPartialSchema = z
  .object({
    role: z.string().optional(),
    company: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().nullable().optional(),
    highlights: z.array(z.string()).optional(),
  })
  .strict();

const ProjectEntrySchema = z.object({
  name: z.string(),
  summary: z.string(),
  techStack: z.array(z.string()),
  outcomes: z.array(z.string()),
});

const ProjectEntryPartialSchema = z
  .object({
    name: z.string().optional(),
    summary: z.string().optional(),
    techStack: z.array(z.string()).optional(),
    outcomes: z.array(z.string()).optional(),
  })
  .strict();

const EducationEntrySchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  endDate: z.string(),
});

const EducationEntryPartialSchema = z
  .object({
    institution: z.string().optional(),
    degree: z.string().optional(),
    field: z.string().optional(),
    endDate: z.string().optional(),
  })
  .strict();

const nonNegInt = z.number().int().min(0);

const SetIdentitySchema = z
  .object({
    kind: z.literal("set_identity"),
    name: z.string().optional(),
    headline: z.string().optional(),
    summary: z.string().optional(),
  })
  .refine(
    (op) =>
      op.name !== undefined ||
      op.headline !== undefined ||
      op.summary !== undefined,
    { message: "set_identity requires at least one of name/headline/summary" },
  );

const AddExperienceSchema = z.object({
  kind: z.literal("add_experience"),
  entry: ExperienceEntrySchema,
});

const EditExperienceSchema = z.object({
  kind: z.literal("edit_experience"),
  index: nonNegInt,
  entry: ExperienceEntryPartialSchema,
});

const RemoveExperienceSchema = z.object({
  kind: z.literal("remove_experience"),
  index: nonNegInt,
});

const AddProjectSchema = z.object({
  kind: z.literal("add_project"),
  entry: ProjectEntrySchema,
});

const EditProjectSchema = z.object({
  kind: z.literal("edit_project"),
  index: nonNegInt,
  entry: ProjectEntryPartialSchema,
});

const RemoveProjectSchema = z.object({
  kind: z.literal("remove_project"),
  index: nonNegInt,
});

const AddSkillsSchema = z.object({
  kind: z.literal("add_skills"),
  category: z.string().min(1),
  skills: z.array(z.string().min(1)).min(1),
});

const RemoveSkillsSchema = z.object({
  kind: z.literal("remove_skills"),
  category: z.string().min(1),
  skills: z.array(z.string().min(1)).min(1),
});

const AddEducationSchema = z.object({
  kind: z.literal("add_education"),
  entry: EducationEntrySchema,
});

const EditEducationSchema = z.object({
  kind: z.literal("edit_education"),
  index: nonNegInt,
  entry: EducationEntryPartialSchema,
});

const RemoveEducationSchema = z.object({
  kind: z.literal("remove_education"),
  index: nonNegInt,
});

// Functionally a discriminated union over "kind". We use z.union (not
// z.discriminatedUnion) because SetIdentitySchema is a ZodEffects (it carries
// a .refine), and z.discriminatedUnion only accepts ZodObject options. The
// cost is slightly less precise error messages on bad input — acceptable.
const ProfileUpdateOpSchema: z.ZodType<ProfileUpdateOp> = z.union([
  SetIdentitySchema,
  AddExperienceSchema,
  EditExperienceSchema,
  RemoveExperienceSchema,
  AddProjectSchema,
  EditProjectSchema,
  RemoveProjectSchema,
  AddSkillsSchema,
  RemoveSkillsSchema,
  AddEducationSchema,
  EditEducationSchema,
  RemoveEducationSchema,
]);

const ChatResponseSchema = z.object({
  updates: z.array(ProfileUpdateOpSchema),
  reply: z.string().min(1),
});

/**
 * One chat turn.
 *
 * Single LLM call returning {updates, reply}. Code validates the response
 * via Zod, applies the updates to a new profile (pure), persists, and
 * returns the assistant message plus the applied ops and updated profile.
 *
 * Always saves — even when updates is empty — to keep the contract simple.
 *
 * No retries. Failures (bad shape, unknown op, out-of-range index, save
 * error) all throw; the caller surfaces.
 */
export async function chatTurn(
  llm: LLMProvider,
  profileStore: IProfileStore,
  thread: ChatThread,
  userMessage: string,
): Promise<ChatTurnResult> {
  const profile = await profileStore.load();
  const completeness = reportCompleteness(profile);
  const { system, messages } = buildChatPrompt({
    profile,
    thread,
    userMessage,
    completeness,
  });

  const raw = await llm.completeJSON<unknown>({
    system,
    messages,
    temperature: 0.4,
  });

  const result = ChatResponseSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(`chatTurn: invalid LLM response: ${issues}`);
  }

  const parsed = result.data;
  const updatedProfile = applyProfileUpdates(profile, parsed.updates);
  await profileStore.save(updatedProfile);

  return {
    reply: { role: "assistant", content: parsed.reply },
    appliedOps: parsed.updates,
    updatedProfile,
  };
}
