import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { profileRouter } from "./routes/profile.js";
import { chatRouter } from "./routes/chat.js";
import { analyzeRouter } from "./routes/analyze.js";
import { matchesRouter } from "./routes/matches.js";
import type {
  IMatchHistory,
  IProfileStore,
  LLMProvider,
} from "../core/types.js";

/**
 * Express server bootstrap. Accepts deps as args (so tests inject fakes).
 *
 * Mounts /api/health, /api/profile, /api/chat, /api/analyze, /api/matches.
 * Adds a 4-arg error handler that maps err.statusCode ?? 500 and returns
 * { error: err.message }. No stack traces leaked.
 */
export function createServer(deps: {
  llm: LLMProvider;
  profileStore: IProfileStore;
  matchHistory: IMatchHistory;
}): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use("/api/profile", profileRouter({ profileStore: deps.profileStore }));
  app.use(
    "/api/chat",
    chatRouter({ llm: deps.llm, profileStore: deps.profileStore }),
  );
  app.use(
    "/api/analyze",
    analyzeRouter({
      llm: deps.llm,
      profileStore: deps.profileStore,
      matchHistory: deps.matchHistory,
    }),
  );
  app.use("/api/matches", matchesRouter({ matchHistory: deps.matchHistory }));

  app.use(
    (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
      const e = err as { statusCode?: number; message?: string };
      const status = typeof e.statusCode === "number" ? e.statusCode : 500;
      const message =
        typeof e.message === "string" && e.message.length > 0
          ? e.message
          : "Internal server error";
      res.status(status).json({ error: message });
    },
  );

  return app;
}

async function main() {
  const port = Number(process.env.PORT ?? 3001);
  const { buildDeps } = await import("./deps.js");
  const deps = buildDeps();
  const app = createServer(deps);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
