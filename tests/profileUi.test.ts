import * as assert from 'assert';
import { buildProfileMenuItems, profileDisplayName } from '../src/profileUi';

assert.strictEqual(profileDisplayName(''), 'Default');
assert.strictEqual(profileDisplayName('  noblepro  '), 'noblepro');

assert.deepStrictEqual(
  buildProfileMenuItems(['haku', 'noblepro', 'haku', ''], 'noblepro'),
  [
    { id: '', label: 'Default', active: false },
    { id: 'haku', label: 'haku', active: false },
    { id: 'noblepro', label: 'noblepro', active: true },
  ],
);

assert.deepStrictEqual(
  buildProfileMenuItems([], ''),
  [{ id: '', label: 'Default', active: true }],
);

console.log('profileUi tests passed');
