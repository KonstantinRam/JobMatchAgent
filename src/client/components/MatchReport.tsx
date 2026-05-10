import { useMemo, useState } from "react";
import type {
  DimensionKey,
  DimensionResult,
  JobRequirement,
  MatchAssessment,
  MatchVerdict,
  RequirementMatch,
} from "../../core/types.js";

interface Props {
  assessment: MatchAssessment;
}

export function MatchReport({ assessment }: Props) {
  const [showRequirements, setShowRequirements] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  const reqIndex = useMemo(() => {
    const m = new Map<string, JobRequirement>();
    for (const r of assessment.jobPosting.requirements) m.set(r.id, r);
    return m;
  }, [assessment]);

  const dimByKey = useMemo(() => {
    const m = new Map<DimensionKey, DimensionResult>();
    for (const d of assessment.dimensions) m.set(d.dimension, d);
    return m;
  }, [assessment]);

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">
            {assessment.jobPosting.title || "Untitled role"}
          </h3>
          {assessment.jobPosting.company && (
            <div className="text-sm text-neutral-600">
              {assessment.jobPosting.company}
              {assessment.jobPosting.location
                ? ` · ${assessment.jobPosting.location}`
                : ""}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <ScoreBadge score={assessment.overallScore} size="lg" />

        </div>
      </header>

      {assessment.triageNote && (
        <p className="rounded-md bg-neutral-50 p-3 text-sm text-neutral-800">
          {assessment.triageNote}
        </p>
      )}

      {/* Dimension cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            "technical_skills",
            "domain_knowledge",
            "experience_level",
            "role_fit",
          ] as DimensionKey[]
        ).map((key) => {
          const d = dimByKey.get(key);
          if (!d) return null;
          return <DimensionCard key={key} dim={d} />;
        })}
      </div>

      {/* Per-requirement detail */}
      <Disclosure
        title={`Per-requirement breakdown (${assessment.matches.length})`}
        open={showRequirements}
        onToggle={() => setShowRequirements((v) => !v)}
      >
        <ul className="divide-y divide-neutral-200">
          {assessment.matches.map((m) => (
            <RequirementRow
              key={m.requirementId}
              match={m}
              requirement={reqIndex.get(m.requirementId)}
            />
          ))}
        </ul>
      </Disclosure>

      {/* Unscored bucket */}
      {assessment.unscoredRequirements.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-neutral-800">
            Unscored — needs human review
          </h4>
          <ul className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
            {assessment.unscoredRequirements.map((r) => (
              <li key={r.id} className="text-neutral-700">
                <span className="font-medium">{r.text}</span>
                <span className="ml-2 text-xs text-neutral-500">
                  · {humanizeDimension(r.dimension)} ·{" "}
                  {r.matchability === "unmatchable"
                    ? "unmatchable"
                    : r.matchability}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Job posting trace */}
      <Disclosure
        title="Job posting trace"
        open={showTrace}
        onToggle={() => setShowTrace((v) => !v)}
      >
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-neutral-500">Title:</span>{" "}
            {assessment.jobPosting.title}
          </div>
          <div>
            <span className="text-neutral-500">Company:</span>{" "}
            {assessment.jobPosting.company ?? "—"}
          </div>
          <div>
            <span className="text-neutral-500">Location:</span>{" "}
            {assessment.jobPosting.location ?? "—"}
          </div>
          <pre className="mt-2 max-h-96 overflow-auto rounded bg-neutral-900 p-3 text-[11px] text-neutral-100">
            {JSON.stringify(assessment.jobPosting.requirements, null, 2)}
          </pre>
        </div>
      </Disclosure>
    </div>
  );
}

function DimensionCard({ dim }: { dim: DimensionResult }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-medium text-neutral-800">
          {humanizeDimension(dim.dimension)}
        </div>
        <ScoreBadge score={dim.score} size="sm" />
      </div>
      <div className="space-y-0.5 text-xs text-neutral-700">
        <div>
          {dim.matchedMustHaves} of {dim.totalMustHaves} must-haves
        </div>
        {dim.totalNiceToHaves > 0 && (
          <div>
            {dim.matchedNiceToHaves} of {dim.totalNiceToHaves} nice-to-haves
          </div>
        )}
        {(dim.uncertainCount > 0 || dim.unmatchableCount > 0) && (
          <div className="mt-1 text-[11px] text-neutral-500">
            {dim.uncertainCount > 0 && <span>{dim.uncertainCount} uncertain</span>}
            {dim.uncertainCount > 0 && dim.unmatchableCount > 0 && " · "}
            {dim.unmatchableCount > 0 && (
              <span>{dim.unmatchableCount} unmatchable</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RequirementRow(props: {
  match: RequirementMatch;
  requirement: JobRequirement | undefined;
}) {
  const { match, requirement } = props;
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm text-neutral-900">
            {requirement?.text ?? <em>Unknown requirement</em>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <VerdictBadge verdict={match.verdict} />
            {requirement && (
              <span
                className={
                  requirement.hardness === "must_have"
                    ? "rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-800"
                    : "rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600"
                }
              >
                {requirement.hardness === "must_have"
                  ? "must-have"
                  : "nice-to-have"}
              </span>
            )}
          </div>
        </div>
      </div>

      {match.evidence.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-neutral-500">
          {match.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}

      {match.matcher === "soft_llm" && match.reasoning && (
        <div className="mt-1 text-xs italic text-neutral-600">
          {match.reasoning}
        </div>
      )}
    </li>
  );
}

function ScoreBadge({
  score,
  size,
}: {
  score: number | null;
  size: "sm" | "lg";
}) {
  const text = score === null ? "n/a" : `${score} / 100`;
  const color =
    score === null
      ? "bg-neutral-200 text-neutral-600"
      : score >= 70
        ? "bg-green-100 text-green-800"
        : score >= 50
          ? "bg-amber-100 text-amber-900"
          : "bg-red-100 text-red-800";
  const sizeCls =
    size === "lg" ? "px-3 py-1 text-2xl font-bold" : "px-2 py-0.5 text-sm font-semibold";
  return (
    <span className={`rounded-md ${color} ${sizeCls}`}>{text}</span>
  );
}

function VerdictBadge({ verdict }: { verdict: MatchVerdict }) {
  const color =
    verdict === "matched"
      ? "bg-green-100 text-green-800"
      : verdict === "unmatched"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-900";
  return (
    <span className={`rounded px-1.5 py-0.5 ${color}`}>{verdict}</span>
  );
}


function Disclosure(props: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-neutral-200">
      <button
        type="button"
        onClick={props.onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        <span>{props.title}</span>
        <span className="text-neutral-400">{props.open ? "−" : "+"}</span>
      </button>
      {props.open && <div className="px-3 pb-3 pt-1">{props.children}</div>}
    </div>
  );
}

function humanizeDimension(key: DimensionKey): string {
  switch (key) {
    case "technical_skills":
      return "Technical skills";
    case "domain_knowledge":
      return "Domain knowledge";
    case "experience_level":
      return "Experience level";
    case "role_fit":
      return "Role fit";
  }
}
