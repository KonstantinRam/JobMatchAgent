import type {
  BackgroundProfile,
  ChatMessage,
  ChatThread,
  MatchAssessment,
  MatchSummary,
  ProfileCompletenessReport,
  ProfileUpdateOp,
} from "../../core/types.js";

/**
 * Thin fetch wrapper around the backend API.
 * No axios. No interceptors. No retry logic.
 * If the server returns non-2xx, throw with the parsed { error } message.
 */

const BASE = "/api";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body && typeof body.error === "string" && body.error.length > 0) {
        message = body.error;
      }
    } catch {
      // body wasn't JSON; fall back to statusText.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

// ---- Profile ----

export async function fetchProfile(): Promise<{
  profile: BackgroundProfile;
  completeness: ProfileCompletenessReport;
}> {
  const res = await fetch(`${BASE}/profile`);
  return jsonOrThrow(res);
}

export async function resetProfile(): Promise<{
  profile: BackgroundProfile;
  completeness: ProfileCompletenessReport;
}> {
  const res = await fetch(`${BASE}/profile/reset`, { method: "POST" });
  return jsonOrThrow(res);
}

// ---- Chat ----

export interface ChatTurnResponse {
  reply: ChatMessage;
  appliedOps: ProfileUpdateOp[];
  updatedProfile: BackgroundProfile;
}

export async function postChat(
  thread: ChatThread,
  message: string,
): Promise<ChatTurnResponse> {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread, message }),
  });
  return jsonOrThrow(res);
}

// ---- Analyze ----

export interface AnalyzeResponse {
  assessment: MatchAssessment;
  summary: MatchSummary;
}

export async function postAnalyzeFile(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    body: form,
  });
  return jsonOrThrow(res);
}

export async function postAnalyzeText(text: string): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return jsonOrThrow(res);
}

// ---- Matches ----

export async function fetchMatches(): Promise<MatchSummary[]> {
  const res = await fetch(`${BASE}/matches`);
  const body = await jsonOrThrow<{ matches: MatchSummary[] }>(res);
  return body.matches;
}

export async function fetchMatch(id: string): Promise<MatchAssessment> {
  const res = await fetch(`${BASE}/matches/${encodeURIComponent(id)}`);
  const body = await jsonOrThrow<{ assessment: MatchAssessment }>(res);
  return body.assessment;
}

export async function deleteMatch(id: string): Promise<boolean> {
  const res = await fetch(`${BASE}/matches/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = await jsonOrThrow<{ deleted: boolean }>(res);
  return body.deleted;
}
