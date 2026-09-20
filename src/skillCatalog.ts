/**
 * Loads Hermes skills from the Hermes home directory.
 *
 * Each skill is a directory containing SKILL.md with YAML frontmatter. Two
 * layouts are valid and both occur in a real install: a skill directly under
 * `skills/` (`brandkit/SKILL.md`) and one nested under a category
 * (`apple/apple-notes/SKILL.md`).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SkillEntry {
  name: string;
  description: string;
  /** Category directory, or '' for a skill stored at the top level. */
  category: string;
}

export interface SkillGroup {
  category: string;
  skills: SkillEntry[];
}

/**
 * Where Hermes keeps skills on this platform.
 *
 * Windows uses %LOCALAPPDATA%\hermes rather than ~/.hermes, so a homedir-only
 * lookup silently found nothing and the skill menu was empty for every Windows
 * user. HERMES_HOME wins when set, matching the agent's own resolution order.
 */
export function hermesSkillsDir(): string {
  const explicit = process.env.HERMES_HOME;
  if (explicit) return path.join(explicit, 'skills');

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
      ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'hermes', 'skills');
  }

  return path.join(os.homedir(), '.hermes', 'skills');
}

/** Read one SKILL.md, returning null when it is missing or unreadable. */
function readSkill(dir: string, fallbackName: string, category: string): SkillEntry | null {
  const skillMd = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return null;

  try {
    const content = fs.readFileSync(skillMd, 'utf8');
    const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
    let name = fallbackName;
    let description = '';

    if (fmMatch) {
      const nameMatch = /^name:\s*(.+)$/m.exec(fmMatch[1]);
      const descMatch = /^description:\s*(.+)$/m.exec(fmMatch[1]);
      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    }

    return { name, description, category };
  } catch {
    return null;
  }
}

/** Scan a skills root and return grouped skills sorted alphabetically. */
export function readSkillsFrom(skillsDir: string): SkillGroup[] {
  if (!fs.existsSync(skillsDir)) return [];

  const byCategory = new Map<string, SkillEntry[]>();
  const push = (entry: SkillEntry | null) => {
    if (!entry) return;
    const bucket = byCategory.get(entry.category) ?? [];
    bucket.push(entry);
    byCategory.set(entry.category, bucket);
  };

  try {
    const top = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    for (const entry of top) {
      const dir = path.join(skillsDir, entry);

      // A SKILL.md here means the directory is the skill itself, not a
      // category. Checked first: a category never carries one.
      const flat = readSkill(dir, entry, '');
      if (flat) {
        push(flat);
        continue;
      }

      try {
        const nested = fs.readdirSync(dir, { withFileTypes: true })
          .filter(d => d.isDirectory());
        for (const child of nested) {
          push(readSkill(path.join(dir, child.name), child.name, entry));
        }
      } catch {
        // Unreadable category
      }
    }
  } catch {
    // Skills dir unreadable
  }

  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, skills]) => ({
      category,
      skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** Scan the platform's Hermes skills directory. */
export function loadHermesSkills(): SkillGroup[] {
  return readSkillsFrom(hermesSkillsDir());
}
