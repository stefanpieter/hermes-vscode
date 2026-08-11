import assert from 'node:assert/strict';
import test from 'node:test';

import { ORIGINAL_EXTENSION_ID, isOriginalExtensionInstalled } from '../successorIdentity';

test('detects the original Marketplace extension by exact extension ID', () => {
  const requested: string[] = [];
  const installed = isOriginalExtensionInstalled((extensionId) => {
    requested.push(extensionId);
    return { id: extensionId };
  });

  assert.equal(installed, true);
  assert.deepEqual(requested, [ORIGINAL_EXTENSION_ID]);
});

test('allows activation when the original Marketplace extension is absent', () => {
  assert.equal(isOriginalExtensionInstalled(() => undefined), false);
});
