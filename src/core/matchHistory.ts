import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type {
  IMatchHistory,
  MatchAssessment,
  MatchSummary,
} from "./types.js";

const SAFE_ID = /^[A-Za-z0-9-]+$/;

function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid match id: ${JSON.stringify(id)}`);
  }
}

function summarize(
  id: string,
  record: MatchAssessment & { createdAt: string },
): MatchSummary {
  return {
    id,
    createdAt: record.createdAt,
    jobTitle: record.jobPosting.title,
    company: record.jobPosting.company,
    overallScore: record.overallScore,
    flaggedForReview: record.flaggedForReview,
  };
}

/**
 * File-backed match history.
 *
 * Each assessment is stored as <dir>/<id>.json. Listing reads the directory.
 * No index file — a single user with at most a few dozen assessments doesn't
 * need one. If this ever grows, add an index lazily.
 *
 * id format: `${createdAt-compact}-${shortHash}` where shortHash is the
 * first 8 hex chars of sha256(jobPosting.rawText). This makes ids stable
 * for identical inputs (collision-tolerant) and human-scannable in the
 * directory listing.
 *
 * The on-disk format is the full MatchAssessment plus the createdAt timestamp.
 * On load, the createdAt is preserved; on list, the summary is derived
 * from each file's contents (one read per assessment — fine for the demo
 * scale).
 */
export class FileMatchHistory implements IMatchHistory {
  constructor(private readonly dir: string) {}

  async list(): Promise<MatchSummary[]> {
    await fs.mkdir(this.dir, { recursive: true });

    const entries = await fs.readdir(this.dir);
    const jsonFiles = entries.filter((f) => f.endsWith(".json"));

    const summaries: MatchSummary[] = [];
    for (const file of jsonFiles) {
      const fullPath = path.join(this.dir, file);
      let raw: string;
      try {
        raw = await fs.readFile(fullPath, "utf8");
      } catch (err) {
        console.warn(
          `FileMatchHistory.list: failed to read ${fullPath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }

      let parsed: MatchAssessment & { createdAt: string };
      try {
        parsed = JSON.parse(raw) as MatchAssessment & { createdAt: string };
      } catch (err) {
        console.warn(
          `FileMatchHistory.list: failed to parse ${fullPath}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }

      const id = file.slice(0, -".json".length);
      summaries.push(summarize(id, parsed));
    }

    summaries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    return summaries;
  }

  async get(id: string): Promise<MatchAssessment | null> {
    assertSafeId(id);
    const filePath = path.join(this.dir, `${id}.json`);

    let raw: string;
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }

    return JSON.parse(raw) as MatchAssessment;
  }

  async save(assessment: MatchAssessment): Promise<MatchSummary> {
    const createdAt = new Date().toISOString();
    const compactCreated = createdAt.replace(/[:.]/g, "-");
    const shortHash = createHash("sha256")
      .update(assessment.jobPosting.rawText)
      .digest("hex")
      .slice(0, 8);
    const id = `${compactCreated}-${shortHash}`;

    const record = { ...assessment, createdAt };

    await fs.mkdir(this.dir, { recursive: true });

    const filePath = path.join(this.dir, `${id}.json`);
    const tmpPath = filePath + ".tmp";
    try {
      await fs.writeFile(tmpPath, JSON.stringify(record, null, 2), "utf8");
      await fs.rename(tmpPath, filePath);
    } catch (err) {
      await fs.unlink(tmpPath).catch(() => {});
      throw err;
    }

    return summarize(id, record);
  }

  async delete(id: string): Promise<boolean> {
    assertSafeId(id);
    const filePath = path.join(this.dir, `${id}.json`);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      throw err;
    }
  }
}
