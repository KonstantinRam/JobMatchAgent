import type {
  BackgroundProfile,
  ProfileUpdateOp,
  SkillGroup,
} from "./types.js";

/**
 * Applies a sequence of ProfileUpdateOps to a profile, returning a NEW
 * profile object. The input profile is not mutated.
 *
 * Each op is applied in order. If an op fails (e.g. edit_experience with
 * an out-of-range index), the error names the op kind, the index where
 * it occurred in the ops array, and the offending field — and is thrown.
 * Subsequent ops are NOT applied; the caller decides whether to retry,
 * partial-commit, or surface to the user.
 *
 * Pure function. No I/O. No mutation of inputs. Deep-clone the profile
 * before applying ops.
 *
 * Validation rules per op kind:
 *   - "set_identity": at least one of name/headline/summary present.
 *   - "add_*":        the entry is well-formed (the op-level Zod schema
 *                     enforces shape; this function trusts it).
 *   - "edit_*":       index in [0, current length).
 *                     Partial entry merges field-by-field; any field set
 *                     replaces the existing one entirely (no deep-merge
 *                     of nested arrays).
 *   - "remove_*":     index in [0, current length).
 *   - "add_skills":   if the category exists, append; else create the
 *                     SkillGroup. Deduplicate skills within the group
 *                     (case-insensitive).
 *   - "remove_skills": case-insensitive removal. If the group becomes
 *                      empty, leave the empty group in place (the chat
 *                      can decide to remove it explicitly via a future
 *                      op type if needed).
 */
export function applyProfileUpdates(
  profile: BackgroundProfile,
  ops: ProfileUpdateOp[],
): BackgroundProfile {
  const next: BackgroundProfile = JSON.parse(JSON.stringify(profile));

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    try {
      applyOne(next, op);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Op #${i} (${op.kind}): ${reason}`);
    }
  }

  return next;
}

function applyOne(p: BackgroundProfile, op: ProfileUpdateOp): void {
  switch (op.kind) {
    case "set_identity": {
      if (
        op.name === undefined &&
        op.headline === undefined &&
        op.summary === undefined
      ) {
        throw new Error("at least one of name/headline/summary must be set");
      }
      if (op.name !== undefined) p.name = op.name;
      if (op.headline !== undefined) p.headline = op.headline;
      if (op.summary !== undefined) p.summary = op.summary;
      return;
    }

    case "add_experience": {
      p.experience.push(op.entry);
      return;
    }
    case "edit_experience": {
      assertIndex(op.index, p.experience.length, "experience");
      p.experience[op.index] = { ...p.experience[op.index], ...op.entry };
      return;
    }
    case "remove_experience": {
      assertIndex(op.index, p.experience.length, "experience");
      p.experience.splice(op.index, 1);
      return;
    }

    case "add_project": {
      p.projects.push(op.entry);
      return;
    }
    case "edit_project": {
      assertIndex(op.index, p.projects.length, "projects");
      p.projects[op.index] = { ...p.projects[op.index], ...op.entry };
      return;
    }
    case "remove_project": {
      assertIndex(op.index, p.projects.length, "projects");
      p.projects.splice(op.index, 1);
      return;
    }

    case "add_education": {
      p.education.push(op.entry);
      return;
    }
    case "edit_education": {
      assertIndex(op.index, p.education.length, "education");
      p.education[op.index] = { ...p.education[op.index], ...op.entry };
      return;
    }
    case "remove_education": {
      assertIndex(op.index, p.education.length, "education");
      p.education.splice(op.index, 1);
      return;
    }

    case "add_skills": {
      const group = findSkillGroup(p.skills, op.category);
      if (group === undefined) {
        const seen = new Set<string>();
        const skills: string[] = [];
        for (const s of op.skills) {
          const k = s.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          skills.push(s);
        }
        p.skills.push({ category: op.category, skills });
      } else {
        const seen = new Set(group.skills.map((s) => s.toLowerCase()));
        for (const s of op.skills) {
          const k = s.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          group.skills.push(s);
        }
      }
      return;
    }
    case "remove_skills": {
      const group = findSkillGroup(p.skills, op.category);
      if (group === undefined) return;
      const drop = new Set(op.skills.map((s) => s.toLowerCase()));
      group.skills = group.skills.filter((s) => !drop.has(s.toLowerCase()));
      return;
    }
  }

  // Exhaustiveness check.
  const _exhaustive: never = op;
  void _exhaustive;
}

function assertIndex(index: number, length: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(
      `index ${index} out of range for ${label} (length ${length})`,
    );
  }
}

function findSkillGroup(
  groups: SkillGroup[],
  category: string,
): SkillGroup | undefined {
  return groups.find((g) => g.category === category);
}
