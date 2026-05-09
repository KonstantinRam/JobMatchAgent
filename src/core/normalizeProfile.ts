import type {
  BackgroundProfile,
  ClaimSet,
  NarrativeBullet,
  SkillClaim,
} from "./types.js";

/**
 * Normalizes a BackgroundProfile into a ClaimSet.
 *
 * Pure function — no LLM, no I/O. The profile is hand-authored, so this is
 * canonicalization, not extraction.
 *
 * Two faces of the output:
 *   - skills + experienceTotals: canonical, comparable, used by the
 *     deterministic tokenizer matcher.
 *   - narrativeBullets: verbatim profile text with source refs, used by the
 *     soft LLM matcher.
 *
 * Skill canonicalization:
 *   - lowercase, kebab-case
 *   - alias collapse: "JS" → "javascript", "TS" → "typescript",
 *     "K8s" → "kubernetes", "Postgres"/"PostgreSQL" → "postgresql".
 *   - the alias map lives in this file as ALIAS_MAP. Keep it small and
 *     additive. Don't synonymize aggressively — false positives are worse
 *     than missed matches.
 *
 * Years derivation per skill:
 *   - If a skill appears in profile.skills[].skills, that's evidence it's
 *     held; years for that skill = years of professional experience overall
 *     (a known weakness — we don't have per-skill year tracking).
 *   - If a skill appears in a project.techStack but not in skills[], add it
 *     anyway with years = 0. (Tracked, but no time claim.)
 *   - This is intentionally crude. The matcher knows tokenizer-side years
 *     are coarse and treats yearsRequired = null as "any years acceptable".
 *
 * Narrative bullets (in order):
 *   - profile.summary → one bullet (source: "summary")
 *   - each profile.experience[i].highlights[j] → one bullet
 *     (source: `experience[${i}].highlights[${j}]`)
 *   - for each profile.projects[i]:
 *     - the project summary (source: `projects[${i}].summary`)
 *     - each outcome (source: `projects[${i}].outcomes[${j}]`)
 *
 * `now` is injectable so tests can freeze time.
 */
export function normalizeProfile(
  profile: BackgroundProfile,
  now: Date = new Date(),
): ClaimSet {
  const totalYearsProfessional = computeTotalYearsProfessional(profile, now);

  const skillsMap = new Map<string, SkillClaim>();

  profile.skills.forEach((group, groupIdx) => {
    group.skills.forEach((skill, skillIdx) => {
      const token = canonicalizeSkill(skill);
      const source = `skills[${groupIdx}][${skillIdx}]`;
      const existing = skillsMap.get(token);
      if (existing) {
        existing.evidenceRefs.push(source);
      } else {
        skillsMap.set(token, {
          skillToken: token,
          years: totalYearsProfessional,
          evidenceRefs: [source],
        });
      }
    });
  });

  profile.projects.forEach((project, i) => {
    project.techStack.forEach((tech) => {
      const token = canonicalizeSkill(tech);
      const source = `projects[${i}]`;
      const existing = skillsMap.get(token);
      if (existing) {
        existing.evidenceRefs.push(source);
      } else {
        skillsMap.set(token, {
          skillToken: token,
          years: 0,
          evidenceRefs: [source],
        });
      }
    });
  });

  const narrativeBullets: NarrativeBullet[] = [];
  narrativeBullets.push({ text: profile.summary, source: "summary" });

  profile.experience.forEach((exp, i) => {
    exp.highlights.forEach((highlight, j) => {
      narrativeBullets.push({
        text: highlight,
        source: `experience[${i}].highlights[${j}]`,
      });
    });
  });

  profile.projects.forEach((project, i) => {
    narrativeBullets.push({
      text: project.summary,
      source: `projects[${i}].summary`,
    });
    project.outcomes.forEach((outcome, j) => {
      narrativeBullets.push({
        text: outcome,
        source: `projects[${i}].outcomes[${j}]`,
      });
    });
  });

  return {
    skills: Array.from(skillsMap.values()),
    experienceTotals: { totalYearsProfessional },
    narrativeBullets,
  };
}

/**
 * Lowercases, kebab-cases, and applies aliases. Exported for testing.
 *
 * Rules, applied in order:
 *   1. trim, lowercase
 *   2. strip a trailing ".js" suffix entirely
 *      ("react.js" → "react", "node.js" → "node")
 *   3. spaces → "-"
 *   4. collapse runs of "-" to a single "-"
 *   5. whole-string lookup in ALIAS_MAP
 *
 * Examples:
 *   "TypeScript"       → "typescript"
 *   "React.js"         → "react"
 *   "Node.js"          → "node"
 *   "JS"               → "javascript"        (alias)
 *   "K8s"              → "kubernetes"        (alias)
 *   "PostgreSQL"       → "postgresql"
 *   "Postgres"         → "postgresql"        (alias)
 *   "Data Engineering" → "data-engineering"
 */
export function canonicalizeSkill(raw: string): string {
  let s = raw.trim().toLowerCase();
  if (s.endsWith(".js")) {
    s = s.slice(0, -3);
  }
  s = s.replace(/\s+/g, "-");
  s = s.replace(/-+/g, "-");
  if (Object.prototype.hasOwnProperty.call(ALIAS_MAP, s)) {
    s = ALIAS_MAP[s];
  }
  return s;
}

/**
 * Small additive alias map. Keep tight — false positives hurt match quality.
 */
export const ALIAS_MAP: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  k8s: "kubernetes",
  postgres: "postgresql",
  py: "python",
};

function computeTotalYearsProfessional(
  profile: BackgroundProfile,
  now: Date,
): number {
  if (profile.experience.length === 0) return 0;

  let earliestStart: Date | null = null;
  let latestEnd: Date | null = null;

  for (const exp of profile.experience) {
    const start = parseYearMonth(exp.startDate);
    if (!earliestStart || start < earliestStart) earliestStart = start;

    const end = exp.endDate ? parseYearMonth(exp.endDate) : now;
    if (!latestEnd || end > latestEnd) latestEnd = end;
  }

  if (!earliestStart || !latestEnd) return 0;

  const ms = latestEnd.getTime() - earliestStart.getTime();
  if (ms <= 0) return 0;
  const years = ms / (1000 * 60 * 60 * 24 * 365.25);
  return Math.round(years * 10) / 10;
}

function parseYearMonth(s: string): Date {
  const [y, m] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
