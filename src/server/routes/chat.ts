import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { chatTurn } from "../../core/chat.js";
import type { IProfileStore, LLMProvider } from "../../core/types.js";

class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ChatRequestSchema = z.object({
  thread: z.object({
    messages: z.array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    ),
  }),
  message: z.string().min(1),
});

/**
 * POST /api/chat
 *
 * Body: { thread: ChatThread, message: string }
 * → { reply, appliedOps, updatedProfile }
 */
export function chatRouter(deps: {
  llm: LLMProvider;
  profileStore: IProfileStore;
}): Router {
  const router: Router = Router();

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = ChatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, `Invalid chat request: ${parsed.error.message}`);
      }
      const { thread, message } = parsed.data;
      const result = await chatTurn(deps.llm, deps.profileStore, thread, message);
      res.json({
        reply: result.reply,
        appliedOps: result.appliedOps,
        updatedProfile: result.updatedProfile,
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
