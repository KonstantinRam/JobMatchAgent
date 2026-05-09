import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import { EMPTY_PROFILE } from "./types.js";
import type { BackgroundProfile, IProfileStore } from "./types.js";

/**
 * Zod schema mirroring BackgroundProfile in types.ts. Kept here (not in
 * types.ts) so the contract file stays free of runtime dependencies.
 */
const ExperienceEntrySchema = z.object({
  role: z.string(),
  company: z.string(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  highlights: z.array(z.string()),
});

const ProjectEntrySchema = z.object({
  name: z.string(),
  summary: z.string(),
  techStack: z.array(z.string()),
  outcomes: z.array(z.string()),
});

const SkillGroupSchema = z.object({
  category: z.string(),
  skills: z.array(z.string()),
});

const EducationEntrySchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  endDate: z.string(),
});

export const ProfileSchema = z.object({
  name: z.string(),
  headline: z.string(),
  summary: z.string(),
  experience: z.array(ExperienceEntrySchema),
  projects: z.array(ProjectEntrySchema),
  skills: z.array(SkillGroupSchema),
  education: z.array(EducationEntrySchema),
});

/**
 * Loads and persists a BackgroundProfile from a JSON file on disk.
 *
 * Read: validate against ProfileSchema (Zod) and return.
 * Write: atomic — write to <path>.tmp, then rename. This prevents
 *        corrupted reads if the process dies mid-write.
 *
 * If the file doesn't exist on first load, return EMPTY_PROFILE rather
 * than throwing. This is the "no profile yet, build it via chat" entry
 * state. ENOENT on save is a real error; ENOENT on load is the empty
 * state.
 *
 * To swap the source (DB, API, generated-from-CV), implement IProfileStore
 * elsewhere and inject. Do not extend this class.
 */
export class JsonProfileStore implements IProfileStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<BackgroundProfile> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return EMPTY_PROFILE;
      }
      throw err;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse profile JSON at ${this.filePath}: ${msg}`);
    }

    const result = ProfileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Profile at ${this.filePath} failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  }

  async save(profile: BackgroundProfile): Promise<void> {
    const result = ProfileSchema.safeParse(profile);
    if (!result.success) {
      throw new Error(
        `Refusing to save invalid profile to ${this.filePath}: ${result.error.message}`,
      );
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const tmpPath = this.filePath + ".tmp";
    try {
      await fs.writeFile(tmpPath, JSON.stringify(profile, null, 2), "utf8");
      await fs.rename(tmpPath, this.filePath);
    } catch (err) {
      await fs.unlink(tmpPath).catch(() => {});
      throw err;
    }
  }
}
