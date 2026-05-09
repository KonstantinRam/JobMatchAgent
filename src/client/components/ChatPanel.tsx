import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BackgroundProfile,
  ChatMessage,
  ChatThread,
  ProfileCompletenessReport,
  ProfileUpdateOp,
} from "../../core/types.js";
import { fetchProfile, postChat } from "../lib/api.js";

interface Props {
  profile: BackgroundProfile;
  completeness: ProfileCompletenessReport;
  onProfileUpdated: (
    nextProfile: BackgroundProfile,
    nextCompleteness: ProfileCompletenessReport,
  ) => void;
}

interface DisplayItem {
  message: ChatMessage;
  appliedOps?: ProfileUpdateOp[];
  synthetic?: boolean;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi — let's build your profile. What's your current role and where are you working?",
};

export function ChatPanel(props: Props) {
  const { profile, onProfileUpdated } = props;

  const [profileEmptyAtMount] = useState(() => isEmptyProfile(profile));
  const [thread, setThread] = useState<ChatThread>({ messages: [] });
  const [opsByIndex, setOpsByIndex] = useState<Record<number, ProfileUpdateOp[]>>(
    {},
  );
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const items: DisplayItem[] = useMemo(() => {
    const out: DisplayItem[] = [];
    if (profileEmptyAtMount && thread.messages.length === 0) {
      out.push({ message: GREETING, synthetic: true });
    }
    thread.messages.forEach((m, i) => {
      out.push({ message: m, appliedOps: opsByIndex[i] });
    });
    return out;
  }, [thread, opsByIndex, profileEmptyAtMount]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [items, loading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;

    setError(null);

    const userMsg: ChatMessage = { role: "user", content: message };
    const sentThread: ChatThread = { messages: thread.messages };
    const optimistic: ChatThread = {
      messages: [...thread.messages, userMsg],
    };
    setThread(optimistic);
    setDraft("");
    setLoading(true);

    try {
      const res = await postChat(sentThread, message);
      setThread((prev) => {
        const replyIndex = prev.messages.length;
        if (res.appliedOps && res.appliedOps.length > 0) {
          setOpsByIndex((m) => ({ ...m, [replyIndex]: res.appliedOps }));
        }
        return { messages: [...prev.messages, res.reply] };
      });

      // Re-fetch profile so completeness stays authoritative.
      try {
        const fresh = await fetchProfile();
        onProfileUpdated(fresh.profile, fresh.completeness);
      } catch {
        // Fall back to the chat-returned profile; completeness stays as-is.
        onProfileUpdated(res.updatedProfile, props.completeness);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setDraft(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-lg border border-neutral-200 bg-white">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-4"
      >
        {items.map((item, i) => (
          <MessageBubble key={i} item={item} />
        ))}
        {loading && (
          <div className="text-xs italic text-neutral-500">Thinking…</div>
        )}
      </div>

      {error && (
        <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="border-t border-neutral-200 p-3">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(e as unknown as React.FormEvent);
              }
            }}
            rows={2}
            placeholder="Tell the agent about your background, or ask a question…"
            disabled={loading}
            className="min-h-[44px] flex-1 resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || draft.trim().length === 0}
            className="shrink-0 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ item }: { item: DisplayItem }) {
  const isUser = item.message.role === "user";
  const align = isUser ? "items-end" : "items-start";
  const bubble = isUser
    ? "bg-neutral-900 text-white"
    : item.synthetic
      ? "bg-neutral-100 text-neutral-700 border border-dashed border-neutral-300"
      : "bg-neutral-100 text-neutral-900";
  return (
    <div className={`flex flex-col ${align}`}>
      {item.appliedOps && item.appliedOps.length > 0 && (
        <div className="mb-1 max-w-[90%] rounded bg-green-50 px-2 py-0.5 text-[11px] text-green-800">
          Updated: {formatAppliedOps(item.appliedOps)}
        </div>
      )}
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${bubble}`}
      >
        {item.message.content}
      </div>
    </div>
  );
}

function formatAppliedOps(ops: ProfileUpdateOp[]): string {
  const counts: Record<string, number> = {};
  const skillTotals: { added: number; removed: number } = {
    added: 0,
    removed: 0,
  };
  for (const op of ops) {
    switch (op.kind) {
      case "set_identity":
        counts["identity updated"] = (counts["identity updated"] ?? 0) + 1;
        break;
      case "add_experience":
        counts["added experience"] = (counts["added experience"] ?? 0) + 1;
        break;
      case "edit_experience":
        counts[`edited experience [${op.index}]`] =
          (counts[`edited experience [${op.index}]`] ?? 0) + 1;
        break;
      case "remove_experience":
        counts[`removed experience [${op.index}]`] =
          (counts[`removed experience [${op.index}]`] ?? 0) + 1;
        break;
      case "add_project":
        counts["added project"] = (counts["added project"] ?? 0) + 1;
        break;
      case "edit_project":
        counts[`edited project [${op.index}]`] =
          (counts[`edited project [${op.index}]`] ?? 0) + 1;
        break;
      case "remove_project":
        counts[`removed project [${op.index}]`] =
          (counts[`removed project [${op.index}]`] ?? 0) + 1;
        break;
      case "add_skills":
        skillTotals.added += op.skills.length;
        break;
      case "remove_skills":
        skillTotals.removed += op.skills.length;
        break;
      case "add_education":
        counts["added education"] = (counts["added education"] ?? 0) + 1;
        break;
      case "edit_education":
        counts[`edited education [${op.index}]`] =
          (counts[`edited education [${op.index}]`] ?? 0) + 1;
        break;
      case "remove_education":
        counts[`removed education [${op.index}]`] =
          (counts[`removed education [${op.index}]`] ?? 0) + 1;
        break;
    }
  }

  const parts: string[] = [];
  for (const [label, n] of Object.entries(counts)) {
    parts.push(n > 1 ? `${label} ×${n}` : label);
  }
  if (skillTotals.added > 0) {
    parts.push(`added ${skillTotals.added} skill${skillTotals.added === 1 ? "" : "s"}`);
  }
  if (skillTotals.removed > 0) {
    parts.push(
      `removed ${skillTotals.removed} skill${skillTotals.removed === 1 ? "" : "s"}`,
    );
  }
  return parts.join(", ");
}

function isEmptyProfile(p: BackgroundProfile): boolean {
  return (
    !p.name &&
    !p.headline &&
    !p.summary &&
    p.experience.length === 0 &&
    p.projects.length === 0 &&
    p.skills.length === 0 &&
    p.education.length === 0
  );
}
