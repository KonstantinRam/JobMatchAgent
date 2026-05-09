import { useState } from "react";
import type {
  BackgroundProfile,
  EducationEntry,
  ExperienceEntry,
  ProfileCompletenessReport,
  ProjectEntry,
  SkillGroup,
} from "../../core/types.js";

interface Props {
  profile: BackgroundProfile;
  completeness: ProfileCompletenessReport;
  onReset: () => Promise<void>;
}

type SectionKey = "identity" | "experience" | "projects" | "skills" | "education";

export function ProfilePanel(props: Props) {
  const { profile, completeness, onReset } = props;

  const initialOpen: Record<SectionKey, boolean> = {
    identity: !hasIdentity(profile),
    experience: profile.experience.length === 0,
    projects: profile.projects.length === 0,
    skills: profile.skills.length === 0,
    education: profile.education.length === 0,
  };
  const [open, setOpen] = useState<Record<SectionKey, boolean>>(initialOpen);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const toggle = (key: SectionKey) =>
    setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleResetClick = async () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    try {
      setResetting(true);
      await onReset();
    } finally {
      setResetting(false);
      setConfirmingReset(false);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-600">
          Profile
        </h2>
        {completeness.isReady ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            Ready to analyze
          </span>
        ) : null}
      </div>

      {!completeness.isReady && (
        <div className="mb-4 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900">
          <div className="font-medium">Profile incomplete</div>
          {completeness.missingSections.length > 0 && (
            <div className="mt-1">
              Missing: {completeness.missingSections.join(", ")}
            </div>
          )}
          {completeness.notes.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {completeness.notes.slice(0, 3).map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-3">
        <Section
          title="Identity"
          isOpen={open.identity}
          onToggle={() => toggle("identity")}
        >
          <IdentityView profile={profile} />
        </Section>

        <Section
          title={`Experience${profile.experience.length ? ` (${profile.experience.length})` : ""}`}
          isOpen={open.experience}
          onToggle={() => toggle("experience")}
        >
          {profile.experience.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-3">
              {profile.experience.map((e, i) => (
                <ExperienceRow key={i} entry={e} />
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={`Projects${profile.projects.length ? ` (${profile.projects.length})` : ""}`}
          isOpen={open.projects}
          onToggle={() => toggle("projects")}
        >
          {profile.projects.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-3">
              {profile.projects.map((p, i) => (
                <ProjectRow key={i} entry={p} />
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={`Skills${profile.skills.length ? ` (${profile.skills.length})` : ""}`}
          isOpen={open.skills}
          onToggle={() => toggle("skills")}
        >
          {profile.skills.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {profile.skills.map((g, i) => (
                <SkillRow key={i} group={g} />
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={`Education${profile.education.length ? ` (${profile.education.length})` : ""}`}
          isOpen={open.education}
          onToggle={() => toggle("education")}
        >
          {profile.education.length === 0 ? (
            <Empty />
          ) : (
            <ul className="space-y-2">
              {profile.education.map((e, i) => (
                <EducationRow key={i} entry={e} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-6 border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={handleResetClick}
          disabled={resetting}
          className={
            confirmingReset
              ? "w-full rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              : "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          }
        >
          {resetting
            ? "Resetting…"
            : confirmingReset
              ? "Click again to confirm reset"
              : "Reset profile"}
        </button>
        {confirmingReset && !resetting && (
          <button
            type="button"
            onClick={() => setConfirmingReset(false)}
            className="mt-2 w-full text-xs text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function Section(props: {
  title: string;
  isOpen: boolean;
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
        <span className="text-neutral-400">{props.isOpen ? "−" : "+"}</span>
      </button>
      {props.isOpen && <div className="px-3 pb-3 pt-1">{props.children}</div>}
    </div>
  );
}

function Empty() {
  return <div className="text-xs italic text-neutral-400">(none yet)</div>;
}

function IdentityView({ profile }: { profile: BackgroundProfile }) {
  if (!hasIdentity(profile)) {
    return <Empty />;
  }
  return (
    <dl className="space-y-1 text-sm">
      {profile.name && (
        <Field label="Name" value={profile.name} />
      )}
      {profile.headline && (
        <Field label="Headline" value={profile.headline} />
      )}
      {profile.summary && (
        <div>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">
            Summary
          </dt>
          <dd className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-800">
            {profile.summary}
          </dd>
        </div>
      )}
    </dl>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="text-sm text-neutral-800">{value}</dd>
    </div>
  );
}

function ExperienceRow({ entry }: { entry: ExperienceEntry }) {
  return (
    <li>
      <div className="text-sm font-medium text-neutral-900">
        {entry.role}
        {entry.company ? ` · ${entry.company}` : ""}
      </div>
      <div className="text-xs text-neutral-500">
        {entry.startDate} – {entry.endDate ?? "present"}
      </div>
      {entry.highlights.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-neutral-700">
          {entry.highlights.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ProjectRow({ entry }: { entry: ProjectEntry }) {
  return (
    <li>
      <div className="text-sm font-medium text-neutral-900">{entry.name}</div>
      {entry.summary && (
        <div className="text-xs text-neutral-700">{entry.summary}</div>
      )}
      {entry.techStack.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.techStack.map((t, i) => (
            <span
              key={i}
              className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-700"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {entry.outcomes.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-neutral-700">
          {entry.outcomes.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SkillRow({ group }: { group: SkillGroup }) {
  return (
    <li>
      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {group.category}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {group.skills.map((s, i) => (
          <span
            key={i}
            className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800"
          >
            {s}
          </span>
        ))}
      </div>
    </li>
  );
}

function EducationRow({ entry }: { entry: EducationEntry }) {
  return (
    <li>
      <div className="text-sm font-medium text-neutral-900">
        {entry.institution}
      </div>
      <div className="text-xs text-neutral-700">
        {entry.degree}
        {entry.field ? `, ${entry.field}` : ""}
      </div>
      <div className="text-xs text-neutral-500">{entry.endDate}</div>
    </li>
  );
}

function hasIdentity(p: BackgroundProfile): boolean {
  return Boolean(p.name || p.headline || p.summary);
}
