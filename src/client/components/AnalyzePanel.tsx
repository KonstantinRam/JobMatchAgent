import { useEffect, useRef, useState } from "react";
import type {
  MatchAssessment,
  MatchSummary,
  ProfileCompletenessReport,
} from "../../core/types.js";
import {
  deleteMatch,
  fetchMatch,
  fetchMatches,
  postAnalyzeFile,
  postAnalyzeText,
} from "../lib/api.js";
import { MatchReport } from "./MatchReport.js";

interface Props {
  completeness: ProfileCompletenessReport;
}

type InputMode =
  | { kind: "file"; file: File | null }
  | { kind: "text"; text: string };

type Phase = "idle" | "extracting" | "assessing" | "summarizing";

export function AnalyzePanel(props: Props) {
  const { completeness } = props;
  const [mode, setMode] = useState<InputMode>({ kind: "text", text: "" });
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentAssessment, setCurrentAssessment] =
    useState<MatchAssessment | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<MatchSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const phaseTimers = useRef<number[]>([]);

  useEffect(() => {
    fetchMatches()
      .then(setHistory)
      .catch((e: unknown) => {
        setHistoryError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  useEffect(() => {
    return () => {
      phaseTimers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const startPhases = () => {
    phaseTimers.current.forEach((t) => window.clearTimeout(t));
    phaseTimers.current = [];
    setPhase("extracting");
    phaseTimers.current.push(
      window.setTimeout(() => setPhase("assessing"), 5000),
    );
    phaseTimers.current.push(
      window.setTimeout(() => setPhase("summarizing"), 13000),
    );
  };

  const stopPhases = () => {
    phaseTimers.current.forEach((t) => window.clearTimeout(t));
    phaseTimers.current = [];
    setPhase("idle");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeness.isReady || loading) return;

    setError(null);
    setLoading(true);
    startPhases();

    try {
      let response;
      if (mode.kind === "file") {
        if (!mode.file) {
          throw new Error("Choose a file first.");
        }
        response = await postAnalyzeFile(mode.file);
      } else {
        if (mode.text.trim().length === 0) {
          throw new Error("Paste a job description first.");
        }
        response = await postAnalyzeText(mode.text);
      }
      setCurrentAssessment(response.assessment);
      setSelectedId(response.summary.id);
      setHistory((prev) => [response.summary, ...prev]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      stopPhases();
      setLoading(false);
    }
  };

  const onSelectHistory = async (id: string) => {
    setError(null);
    try {
      const a = await fetchMatch(id);
      setCurrentAssessment(a);
      setSelectedId(id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const onDeleteHistory = async (id: string) => {
    try {
      await deleteMatch(id);
      setHistory((prev) => prev.filter((s) => s.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setCurrentAssessment(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setMode({ kind: "file", file: files[0] });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* New analysis */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-600">
                New analysis
              </h3>
              <div className="inline-flex rounded border border-neutral-200 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMode({ kind: "text", text: "" })}
                  className={`rounded px-2 py-0.5 ${mode.kind === "text" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
                >
                  Paste text
                </button>
                <button
                  type="button"
                  onClick={() => setMode({ kind: "file", file: null })}
                  className={`rounded px-2 py-0.5 ${mode.kind === "file" ? "bg-neutral-900 text-white" : "text-neutral-600"}`}
                >
                  Upload file
                </button>
              </div>
            </div>

            {!completeness.isReady && (
              <div className="mb-3 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
                Profile is not yet complete. Switch to the Chat tab to fill in
                the missing sections before analyzing.
              </div>
            )}

            {error && (
              <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-3">
              {mode.kind === "text" ? (
                <textarea
                  value={mode.text}
                  onChange={(e) =>
                    setMode({ kind: "text", text: e.target.value })
                  }
                  rows={10}
                  placeholder="Paste the job description here…"
                  className="w-full resize-y rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                />
              ) : (
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFiles(e.dataTransfer.files);
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-8 text-center text-sm cursor-pointer ${
                    dragOver
                      ? "border-neutral-500 bg-neutral-50"
                      : "border-neutral-300"
                  }`}
                >
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => handleFiles(e.target.files)}
                    className="hidden"
                  />
                  {mode.file ? (
                    <>
                      <div className="font-medium text-neutral-800">
                        {mode.file.name}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {(mode.file.size / 1024).toFixed(1)} KB · click or drop
                        to replace
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-neutral-700">
                        Drop a PDF, PNG, JPEG, or WebP here
                      </div>
                      <div className="text-xs text-neutral-500">
                        or click to choose a file
                      </div>
                    </>
                  )}
                </label>
              )}

              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  disabled={!completeness.isReady || loading}
                  className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loading ? "Analyzing…" : "Analyze"}
                </button>
                {loading && (
                  <span className="text-xs italic text-neutral-500">
                    {phaseLabel(phase)} (approximate)
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* History */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-600">
              Past analyses
            </h3>
            {historyError && (
              <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
                {historyError}
              </div>
            )}
            {history.length === 0 ? (
              <p className="text-xs italic text-neutral-400">
                Nothing yet — run an analysis above.
              </p>
            ) : (
              <ul className="space-y-1">
                {history.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-start justify-between gap-2 rounded px-2 py-1.5 ${
                      selectedId === s.id ? "bg-neutral-100" : "hover:bg-neutral-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectHistory(s.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <ScorePill score={s.overallScore} />
                        <span className="text-sm font-medium text-neutral-900">
                          {s.jobTitle || "Untitled"}
                        </span>
                        {s.flaggedForReview && (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-900">
                            flagged
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        {s.company ?? "—"} · {formatDate(s.createdAt)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHistory(s.id)}
                      title="Delete"
                      className="shrink-0 rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-700"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Report */}
      {currentAssessment && <MatchReport assessment={currentAssessment} />}
    </div>
  );
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case "extracting":
      return "Extracting…";
    case "assessing":
      return "Assessing…";
    case "summarizing":
      return "Summarizing…";
    case "idle":
      return "";
  }
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-green-100 text-green-800"
      : score >= 50
        ? "bg-amber-100 text-amber-900"
        : "bg-red-100 text-red-800";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${color}`}>
    {score} / 100
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
