import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { IMatchHistory } from "../../core/types.js";

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const SAFE_ID = /^[A-Za-z0-9-]+$/;

/**
 * Match history endpoints.
 *
 *   GET    /api/matches         → { matches: MatchSummary[] }
 *   GET    /api/matches/:id     → { assessment } | 404
 *   DELETE /api/matches/:id     → { deleted: boolean }
 */
export function matchesRouter(deps: {
  matchHistory: IMatchHistory;
}): Router {
  const router: Router = Router();

  router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const matches = await deps.matchHistory.list();
      res.json({ matches });
    } catch (e) {
      next(e);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      if (!SAFE_ID.test(id)) {
        throw new HttpError(400, "Invalid id");
      }
      const assessment = await deps.matchHistory.get(id);
      if (!assessment) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ assessment });
    } catch (e) {
      next(e);
    }
  });

  router.delete(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = req.params.id;
        if (!SAFE_ID.test(id)) {
          throw new HttpError(400, "Invalid id");
        }
        const deleted = await deps.matchHistory.delete(id);
        res.json({ deleted });
      } catch (e) {
        next(e);
      }
    },
  );

  return router;
}
