import type {
  BackgroundProfile,
  ProfileCompletenessReport,
} from "./types.js";

/**
 * Reports whether a profile has enough content to support a useful match.
 *
 * Used by:
 *   - the chat prompt (so the agent knows what to ask about next)
 *   - the frontend (to gate or warn on the analyze flow)
 *
 * Both sides agree on the rules because they call this same function.
 *
 * Rules (intentionally low bars — the goal is "useful enough", not "complete"):
 *   - identity present  := name AND headline are non-empty after trim.
 *   - experience present := experience.length >= 1
 *                           OR summary contains > 100 characters
 *   - skills present     := skills has at least one group with at least
 *                           one skill, OR there's at least one project
 *                           with a non-empty techStack.
 *
 * isReady := all three present.
 *
 * notes: human-readable hints, e.g. "No projects listed yet — adding 1-2
 *        with concrete outcomes meaningfully improves match quality."
 *        Add hints even when isReady is true, if obvious enrichments are
 *        possible. Cap notes at 5.
 */
export function reportCompleteness(
  profile: BackgroundProfile,
): ProfileCompletenessReport {
  const identityPresent =
    profile.name.trim().length > 0 && profile.headline.trim().length > 0;

  const experiencePresent =
    profile.experience.length >= 1 || profile.summary.length > 100;

  const skillsPresent =
    profile.skills.some((g) => g.skills.length > 0) ||
    profile.projects.some((p) => p.techStack.length > 0);

  const missingSections: ("identity" | "experience" | "skills")[] = [];
  if (!identityPresent) missingSections.push("identity");
  if (!experiencePresent) missingSections.push("experience");
  if (!skillsPresent) missingSections.push("skills");

  const isReady = missingSections.length === 0;

  const notes: string[] = [];

  if (!identityPresent) {
    if (profile.name.trim().length === 0) {
      notes.push("Name is missing — ask the user how they'd like to be referred to.");
    }
    if (profile.headline.trim().length === 0) {
      notes.push(
        "Headline is missing — a one-line role/identity (e.g. \"Senior backend engineer\") helps frame the rest of the profile.",
      );
    }
  }

  if (!experiencePresent) {
    notes.push(
      "No experience entries yet and the summary is short — add at least one role with start date, company, and a few highlights.",
    );
  } else if (profile.experience.length === 0) {
    notes.push(
      "Summary covers the gap, but a structured experience entry would make matching more reliable.",
    );
  }

  if (!skillsPresent) {
    notes.push(
      "No skills or project tech stacks recorded — list the tools, languages, or domains you've worked with.",
    );
  }

  if (profile.projects.length === 0) {
    notes.push(
      "No projects listed yet — adding 1-2 with concrete outcomes meaningfully improves match quality.",
    );
  }

  if (profile.education.length === 0) {
    notes.push("No education entries yet — add any relevant degrees or coursework.");
  }

  if (profile.summary.trim().length === 0) {
    notes.push("Profile summary is empty — a 2-3 sentence overview helps anchor the chat.");
  }

  return {
    isReady,
    missingSections,
    notes: notes.slice(0, 5),
  };
}
