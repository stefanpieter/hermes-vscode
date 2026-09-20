/**
 * `@skill:` mentions.
 *
 * Skills are already advised to Hermes through the toolbar's skill menu; a
 * mention is a faster path to the same mechanism, typed inline instead of
 * hunted for in a dropdown. Matching is pure so it is testable without a DOM
 * or the filesystem.
 */

import type { SkillGroup, SkillEntry } from './skillCatalog';
import type { MentionSuggestion } from './mentions';

/** The `skill:` prefix that distinguishes a skill mention from a file path. */
export const SKILL_PREFIX = 'skill:';

/**
 * Candidate skills for a query, matched on name, category, or description.
 *
 * Category and description count because a user who remembers "something in
 * github" or "the one about root causes" should find it without recalling the
 * exact name. But they rank below the name: searching `debug` must surface
 * `systematic-debugging` before a skill that merely says "debug" in its prose,
 * which is what a plain filter got wrong.
 */
export function matchSkillMentions(groups: SkillGroup[], term: string): MentionSuggestion[] {
  const needle = term.trim().toLowerCase();

  const scored = groups
    .flatMap(group => group.skills)
    .map(skill => ({ skill, score: scoreSkill(skill, needle) }))
    .filter(entry => entry.score > 0);

  // Equal scores: prefer the shorter name. A match that is most of the name
  // is more precise than one padded with unrelated segments, which is why
  // `systematic-debugging` should beat `frontend-runtime-debugging`. Name is
  // the final tiebreak so the order is stable.
  scored.sort((a, b) =>
    b.score - a.score
    || a.skill.name.length - b.skill.name.length
    || a.skill.name.localeCompare(b.skill.name));

  return scored.map(({ skill }) => ({
    mention: `${SKILL_PREFIX}${skill.name}`,
    name: skill.name,
    // Reuse the file picker's dim suffix for the category, so both mention
    // kinds render through one code path.
    directory: skill.category,
    uri: '',
  }));
}

/** Higher is a better match; 0 means no match at all. */
function scoreSkill(skill: SkillEntry, needle: string): number {
  if (needle === '') return 1;

  const name = skill.name.toLowerCase();
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 80;
  // A term that starts a hyphen-separated segment is a deliberate match;
  // one buried mid-word is usually incidental. Without this, searching
  // `debugging` ranked `frontend-runtime-debugging` above
  // `systematic-debugging` purely on alphabetical order.
  if (segments(name).some(part => part.startsWith(needle))) return 70;
  if (name.includes(needle)) return 60;
  if (skill.category.toLowerCase().includes(needle)) return 40;
  if (skill.description.toLowerCase().includes(needle)) return 20;
  return 0;
}

/** Split a skill name into its hyphen- and underscore-separated parts. */
function segments(name: string): string[] {
  return name.split(/[-_]/);
}

/** The skill names in a message, without the `skill:` prefix. */
export function skillNamesFrom(mentions: string[]): string[] {
  return mentions
    .filter(mention => mention.startsWith(SKILL_PREFIX))
    .map(mention => mention.slice(SKILL_PREFIX.length))
    .filter(name => name.length > 0);
}
