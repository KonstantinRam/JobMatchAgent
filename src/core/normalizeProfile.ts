import type {
  BackgroundProfile,
  ClaimSet,
  NarrativeBullet,
  SkillClaim,
} from "./types.js";
import {normalizeSkillToken} from "./skillNormalization.js";

/**
 * Normalizes a BackgroundProfile into a ClaimSet.
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
      const token = normalizeSkillToken(skill);
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
      const token = normalizeSkillToken(tech);
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
