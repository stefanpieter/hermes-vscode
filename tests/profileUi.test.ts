import * as assert from 'assert';
import { buildProfileMenuItems, parseHermesProfileList, profileDisplayName } from '../src/profileUi';

assert.strictEqual(profileDisplayName(''), 'Default');
assert.strictEqual(profileDisplayName('', ' kinni '), 'kinni');
assert.strictEqual(profileDisplayName('  noblepro  ', 'kinni'), 'noblepro');

assert.deepStrictEqual(
  buildProfileMenuItems(['haku', 'noblepro', 'haku', ''], 'noblepro'),
  [
    { id: '', label: 'Default', active: false },
    { id: 'haku', label: 'haku', active: false },
    { id: 'noblepro', label: 'noblepro', active: true },
  ],
);

assert.deepStrictEqual(
  buildProfileMenuItems([], '', 'kinni'),
  [{ id: '', label: 'kinni', active: true }],
);

assert.deepStrictEqual(
  parseHermesProfileList(`
 Profile          Model                        Gateway      Alias
 ───────────────    ───────────────────────────    ───────────    ────────────
 ◆kinni           gpt-5.5                      running      kinni
  haku            gpt-5.5                      running      haku
  noblepro        gpt-5.5                      running      noblepro
`),
  ['haku', 'kinni', 'noblepro'],
);

console.log('profileUi tests passed');
