import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { extractJob } from "../../core/extractJob.js";
import { assessMatch } from "../../core/assessMatch.js";
import { reportCompleteness } from "../../core/profileCompleteness.js";
import type {
  IMatchHistory,
  IProfileStore,
  JobInput,
  LLMProvider,
} from "../../core/types.js";

class HttpError extends Error {
  statusCode: number;
  details?: unknown;
  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * POST /api/analyze
 *
 * Accepts EITHER multipart/form-data (file: PDF/PNG/JPEG/WebP) OR
 * application/json { text }. Persists the assessment via matchHistory.
 *
 * Returns { assessment, summary }.
 */
export function analyzeRouter(deps: {
  llm: LLMProvider;
  profileStore: IProfileStore;
  matchHistory: IMatchHistory;
}): Router {
  const router: Router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  router.post(
    "/",
    upload.single("file"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input = buildJobInput(req);

        const profile = await deps.profileStore.load();
        const completeness = reportCompleteness(profile);
        if (!completeness.isReady) {
          // Do NOT silently match against an empty profile. Surface a 400
          // with the missing sections so the UI can route the user to chat.
          res.status(400).json({
            error: "Profile incomplete",
            missingSections: completeness.missingSections,
            notes: completeness.notes,
          });
          return;
        }

        const job = await extractJob(deps.llm, input);
        const assessment = await assessMatch(deps.llm, job, profile);
        const summary = await deps.matchHistory.save(assessment);
        res.json({ assessment, summary });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}

function buildJobInput(req: Request): JobInput {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (file) {
    if (file.mimetype === "application/pdf") {
      return { kind: "pdf", bytes: file.buffer };
    }
    if (
      file.mimetype === "image/png" ||
      file.mimetype === "image/jpeg" ||
      file.mimetype === "image/webp"
    ) {
      return { kind: "image", bytes: file.buffer, mediaType: file.mimetype };
    }
    throw new HttpError(400, `Unsupported file type: ${file.mimetype}`);
  }

  const body = req.body as { text?: unknown };
  if (typeof body?.text === "string" && body.text.trim().length > 0) {
    return { kind: "text", content: body.text };
  }

  throw new HttpError(400, "Provide either a file or a text body");
}
