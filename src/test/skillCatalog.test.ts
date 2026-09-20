import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { hermesSkillsDir, readSkillsFrom } from '../skillCatalog';

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));
}

function writeSkill(root: string, rel: string, name: string, description: string): void {
  const dir = path.join(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\nbody\n`,
  );
}

test('finds skills stored directly under the skills dir, not only in a category', () => {
  const root = tmpdir();
  // Both shapes exist in a real install: `brandkit/SKILL.md` sits at the top
  // level while `apple/apple-notes/SKILL.md` is nested under a category.
  writeSkill(root, 'brandkit', 'brandkit', 'Premium brand kits');
  writeSkill(root, path.join('apple', 'apple-notes'), 'apple-notes', 'Read Apple Notes');

  const groups = readSkillsFrom(root);
  const names = groups.flatMap(g => g.skills.map(s => s.name));

  assert.ok(names.includes('brandkit'), 'top-level skill was dropped');
  assert.ok(names.includes('apple-notes'), 'nested skill was dropped');
});

test('keeps the category of a nested skill and leaves a top-level one uncategorised', () => {
  const root = tmpdir();
  writeSkill(root, 'brandkit', 'brandkit', 'x');
  writeSkill(root, path.join('apple', 'findmy'), 'findmy', 'y');

  const groups = readSkillsFrom(root);
  const findmy = groups.flatMap(g => g.skills).find(s => s.name === 'findmy');
  const brandkit = groups.flatMap(g => g.skills).find(s => s.name === 'brandkit');

  assert.equal(findmy?.category, 'apple');
  assert.equal(brandkit?.category, '');
});

test('resolves the Hermes skills directory where Hermes actually stores it', () => {
  const dir = hermesSkillsDir();

  if (process.platform === 'win32') {
    // Hermes uses %LOCALAPPDATA%\hermes on Windows; ~/.hermes does not exist,
    // so the previous homedir-only lookup returned nothing for every user.
    assert.match(dir.toLowerCase(), /appdata[\\/]local[\\/]hermes[\\/]skills$/);
  } else {
    assert.match(dir, /\.hermes[\\/]skills$/);
  }
});

test('returns nothing rather than throwing when the directory is absent', () => {
  assert.deepEqual(readSkillsFrom(path.join(tmpdir(), 'missing')), []);
});
