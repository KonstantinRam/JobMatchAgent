import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { ProfileSchema } from "../../core/profile.js";
import { reportCompleteness } from "../../core/profileCompleteness.js";
import { EMPTY_PROFILE } from "../../core/types.js";
import type { IProfileStore } from "../../core/types.js";

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Profile endpoints.
 *
 *   GET    /api/profile              → { profile, completeness }
 *   PUT    /api/profile              body: { profile } → { profile, completeness }
 *   POST   /api/profile/reset        → { profile: EMPTY_PROFILE, completeness }
 */
export function profileRouter(deps: {
  profileStore: IProfileStore;
}): Router {
  const router: Router = Router();

  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const profile = await deps.profileStore.load();
      res.json({ profile, completeness: reportCompleteness(profile) });
    } catch (e) {
      next(e);
    }
  });

  router.put("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as { profile?: unknown };
      const parsed = ProfileSchema.safeParse(body?.profile);
      if (!parsed.success) {
        throw new HttpError(400, `Invalid profile: ${parsed.error.message}`);
      }
      await deps.profileStore.save(parsed.data);
      res.json({
        profile: parsed.data,
        completeness: reportCompleteness(parsed.data),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post(
    "/reset",
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        await deps.profileStore.save(EMPTY_PROFILE);
        res.json({
          profile: EMPTY_PROFILE,
          completeness: reportCompleteness(EMPTY_PROFILE),
        });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
